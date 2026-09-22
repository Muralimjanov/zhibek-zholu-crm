import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditResult, Prisma, StoredFilePurpose, Transaction, TransactionCategory, TransactionType, UserRole } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { dateFilter } from '../attendance/shifts.service';
import { BusinessCalendar, IsoDate, PERIOD_PATTERN, fromDbDate, periodOf, toDbDate } from '../common/business-calendar.service';
import { Page, pageArgs } from '../common/dto/pagination.dto';
import { parseTyiyn } from '../common/money';
import { FieldCipher } from '../crypto/field-cipher.service';
import { DecryptedFile, FileStorageService, UploadedFileInput } from '../files/file-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { CATEGORY_LABELS_RU } from '../reports/reports.service';
import { RequestContext } from '../users/users.service';
import { CreateTransactionDto, ListTransactionsQueryDto, UpdateTransactionDto, categoryMatchesType } from './accounting.dto';

const COMMENT_CONTEXT = 'Transaction.comment';
const MAX_REPORT_DAYS = 366;

export interface TransactionResponse {
  id: string;
  type: TransactionType;
  category: TransactionCategory;
  subcategory: string | null;
  amountTyiyn: string;
  currency: string;
  date: IsoDate;
  comment: string | null;
  hasAttachment: boolean;
  relatedContractId: string | null;
  createdById: string;
  periodClosed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Excel/CSV formula injection guard: text starting with = + - @ TAB CR is prefixed with '. */
export function excelSafe(value: string | null): string {
  if (value === null) return '';
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Accounting (TZ_CRM_DEV_v2 CRUD):
 *   Create        - accountant
 *   Read          - director, accountant (investors: aggregated dashboard only)
 *   Update        - accountant, own records, until the period is closed
 *   Delete        - director (any); accountant (own, until the period is closed)
 * OPEN QUESTION: the TZ text says closed periods are locked "except for the
 * Director", while the CRUD table gives the director no Update right. The
 * stricter table is implemented (director may delete, not edit).
 */
@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly calendar: BusinessCalendar,
    private readonly files: FileStorageService,
    private readonly audit: AuditService,
  ) {}

  private async closedPeriods(periods: string[]): Promise<Set<string>> {
    const rows = await this.prisma.accountingPeriod.findMany({ where: { period: { in: [...new Set(periods)] } } });
    return new Set(rows.map((r) => r.period));
  }

  private async assertPeriodOpen(date: IsoDate): Promise<void> {
    if ((await this.closedPeriods([periodOf(date)])).size > 0) throw new ConflictException('ACCOUNTING_PERIOD_CLOSED');
  }

  private assertNotFuture(date: IsoDate): void {
    if (date > this.calendar.today()) throw new BadRequestException('TRANSACTION_DATE_IN_FUTURE');
  }

  private async assertContractExists(contractId: string | null | undefined): Promise<void> {
    if (!contractId) return;
    const exists = await this.prisma.contract.findUnique({ where: { id: contractId }, select: { id: true } });
    if (!exists) throw new BadRequestException('RELATED_CONTRACT_NOT_FOUND');
  }

  private toResponse(t: Transaction, closed: Set<string>): TransactionResponse {
    const date = fromDbDate(t.date);
    return {
      id: t.id,
      type: t.type,
      category: t.category,
      subcategory: t.subcategory,
      amountTyiyn: t.amountTyiyn.toString(),
      currency: t.currency,
      date,
      comment: this.cipher.decryptNullable(COMMENT_CONTEXT, t.commentEnc),
      hasAttachment: t.attachmentFileId !== null,
      relatedContractId: t.relatedContractId,
      createdById: t.createdById,
      periodClosed: closed.has(periodOf(date)),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async create(actor: AuthenticatedUser, dto: CreateTransactionDto, ctx: RequestContext): Promise<TransactionResponse> {
    if (!categoryMatchesType(dto.type, dto.category)) throw new BadRequestException('CATEGORY_DOES_NOT_MATCH_TYPE');
    this.assertNotFuture(dto.date);
    await this.assertPeriodOpen(dto.date);
    await this.assertContractExists(dto.relatedContractId);

    const t = await this.prisma.transaction.create({
      data: {
        type: dto.type,
        category: dto.category,
        subcategory: dto.subcategory,
        amountTyiyn: parseTyiyn(dto.amountTyiyn),
        date: toDbDate(dto.date),
        commentEnc: this.cipher.encryptNullable(COMMENT_CONTEXT, dto.comment),
        relatedContractId: dto.relatedContractId,
        createdById: actor.id,
      },
    });
    await this.auditTx(actor, AuditAction.TRANSACTION_CREATED, t, ctx);
    return this.toResponse(t, new Set());
  }

  async list(q: ListTransactionsQueryDto): Promise<Page<TransactionResponse>> {
    const where: Prisma.TransactionWhereInput = {
      ...dateFilter(q.from, q.to),
      ...(q.type ? { type: q.type } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.relatedContractId ? { relatedContractId: q.relatedContractId } : {}),
    };
    const { take, skip } = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({ where, take, skip, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.transaction.count({ where }),
    ]);
    const closed = await this.closedPeriods(rows.map((r) => periodOf(fromDbDate(r.date))));
    return { items: rows.map((r) => this.toResponse(r, closed)), total, limit: take, offset: skip };
  }

  async get(id: string): Promise<TransactionResponse> {
    const t = await this.prisma.transaction.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('TRANSACTION_NOT_FOUND');
    return this.toResponse(t, await this.closedPeriods([periodOf(fromDbDate(t.date))]));
  }

  /** Accountant, own record, period (both old and new date) still open. */
  private async findEditableByAccountant(actor: AuthenticatedUser, id: string): Promise<Transaction> {
    if (actor.role !== UserRole.accountant) throw new ForbiddenException('AUTH_FORBIDDEN');
    const t = await this.prisma.transaction.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('TRANSACTION_NOT_FOUND');
    if (t.createdById !== actor.id) throw new ForbiddenException('TRANSACTION_NOT_OWNED');
    await this.assertPeriodOpen(fromDbDate(t.date));
    return t;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateTransactionDto, ctx: RequestContext): Promise<TransactionResponse> {
    const t = await this.findEditableByAccountant(actor, id);
    const type = dto.type ?? t.type;
    const category = dto.category ?? t.category;
    if (!categoryMatchesType(type, category)) throw new BadRequestException('CATEGORY_DOES_NOT_MATCH_TYPE');
    if (dto.date !== undefined) {
      this.assertNotFuture(dto.date);
      await this.assertPeriodOpen(dto.date);
    }
    if (dto.relatedContractId) await this.assertContractExists(dto.relatedContractId);

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        type,
        category,
        subcategory: dto.subcategory,
        amountTyiyn: dto.amountTyiyn === undefined ? undefined : parseTyiyn(dto.amountTyiyn),
        date: dto.date === undefined ? undefined : toDbDate(dto.date),
        commentEnc: dto.comment === undefined ? undefined : this.cipher.encryptNullable(COMMENT_CONTEXT, dto.comment),
        relatedContractId: dto.relatedContractId,
      },
    });
    await this.auditTx(actor, AuditAction.TRANSACTION_UPDATED, updated, ctx, {
      fields: Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined),
    });
    return this.toResponse(updated, new Set());
  }

  /**
   * Удаляет операцию. С 22.09.2026 право есть только у бухгалтера и только
   * на свои записи в незакрытом месяце: решением владельца у директора
   * забрано всякое редактирование, кроме отчётности и аккаунтов.
   */
  async remove(actor: AuthenticatedUser, id: string, ctx: RequestContext): Promise<void> {
    const t = await this.findEditableByAccountant(actor, id);
    await this.prisma.transaction.delete({ where: { id } });
    await this.files.remove(t.attachmentFileId);
    await this.auditTx(actor, AuditAction.TRANSACTION_DELETED, t, ctx);
  }

  async attach(actor: AuthenticatedUser, id: string, file: UploadedFileInput | undefined, ctx: RequestContext): Promise<TransactionResponse> {
    const t = await this.findEditableByAccountant(actor, id);
    const stored = await this.files.store(StoredFilePurpose.transaction_attachment, actor.id, file);
    let updated: Transaction;
    try {
      updated = await this.prisma.transaction.update({ where: { id }, data: { attachmentFileId: stored.id } });
    } catch (err) {
      await this.files.remove(stored.id);
      throw err;
    }
    await this.files.remove(t.attachmentFileId);
    await this.auditTx(actor, AuditAction.TRANSACTION_ATTACHMENT_UPLOADED, updated, ctx, { fileId: stored.id });
    return this.toResponse(updated, new Set());
  }

  async downloadAttachment(actor: AuthenticatedUser, id: string, ctx: RequestContext): Promise<DecryptedFile> {
    const t = await this.prisma.transaction.findUnique({ where: { id } });
    if (!t?.attachmentFileId) throw new NotFoundException('FILE_NOT_FOUND');
    const file = await this.files.read(t.attachmentFileId);
    await this.auditTx(actor, AuditAction.FILE_DOWNLOADED, t, ctx, { fileId: t.attachmentFileId, purpose: 'transaction_attachment' });
    return file;
  }

  // --- Periods -----------------------------------------------------------------

  async closePeriod(actor: AuthenticatedUser, period: string, ctx: RequestContext) {
    if (!PERIOD_PATTERN.test(period)) throw new BadRequestException('PERIOD_INVALID');
    if (period >= periodOf(this.calendar.today())) throw new BadRequestException('PERIOD_NOT_FINISHED');
    try {
      const row = await this.prisma.accountingPeriod.create({ data: { period, closedById: actor.id } });
      await this.audit.record({
        actorUserId: actor.id,
        action: AuditAction.ACCOUNTING_PERIOD_CLOSED,
        entityType: 'AccountingPeriod',
        entityId: period,
        result: AuditResult.success,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { period },
      });
      return row;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('ACCOUNTING_PERIOD_ALREADY_CLOSED');
      }
      throw err;
    }
  }

  listPeriods() {
    return this.prisma.accountingPeriod.findMany({ orderBy: { period: 'desc' } });
  }

  // --- Reports -----------------------------------------------------------------

  private assertRange(from: IsoDate, to: IsoDate): void {
    if (from > to) throw new BadRequestException('DATE_RANGE_INVALID');
    const days = (toDbDate(to).getTime() - toDbDate(from).getTime()) / 86_400_000;
    if (days > MAX_REPORT_DAYS) throw new BadRequestException('DATE_RANGE_TOO_LARGE');
  }

  /** Per-category breakdown for a period (TZ: not just a grand total). */
  async summary(from: IsoDate, to: IsoDate) {
    this.assertRange(from, to);
    const rows = await this.prisma.transaction.groupBy({
      by: ['type', 'category'],
      where: dateFilter(from, to),
      _sum: { amountTyiyn: true },
      _count: { _all: true },
    });
    const total = (type: TransactionType) =>
      rows.filter((r) => r.type === type).reduce((acc, r) => acc + (r._sum.amountTyiyn ?? 0n), 0n);
    const income = total(TransactionType.income);
    const expense = total(TransactionType.expense);
    return {
      from,
      to,
      incomeTyiyn: income.toString(),
      expenseTyiyn: expense.toString(),
      netTyiyn: (income - expense).toString(),
      byCategory: Object.values(TransactionCategory).map((category) => {
        const r = rows.find((x) => x.category === category);
        return {
          category,
          label: CATEGORY_LABELS_RU[category],
          type: categoryMatchesType(TransactionType.income, category) ? TransactionType.income : TransactionType.expense,
          count: r?._count._all ?? 0,
          amountTyiyn: (r?._sum.amountTyiyn ?? 0n).toString(),
        };
      }),
    };
  }

  async exportXlsx(actor: AuthenticatedUser, from: IsoDate, to: IsoDate, ctx: RequestContext): Promise<Buffer> {
    const summary = await this.summary(from, to);
    const rows = await this.prisma.transaction.findMany({
      where: dateFilter(from, to),
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      take: 50_000,
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'CRM';
    const sheet = wb.addWorksheet('Сводка');
    sheet.addRow([`Период: ${from} — ${to}`]);
    sheet.addRow(['Тип', 'Категория', 'Операций', 'Сумма, сом']);
    for (const c of summary.byCategory) {
      sheet.addRow([c.type === 'income' ? 'Приход' : 'Расход', c.label, c.count, somNumber(BigInt(c.amountTyiyn))]);
    }
    sheet.addRow([]);
    sheet.addRow(['Итого приходы', '', '', somNumber(BigInt(summary.incomeTyiyn))]);
    sheet.addRow(['Итого расходы', '', '', somNumber(BigInt(summary.expenseTyiyn))]);
    sheet.addRow(['Результат', '', '', somNumber(BigInt(summary.netTyiyn))]);

    const ops = wb.addWorksheet('Операции');
    ops.addRow(['Дата', 'Тип', 'Категория', 'Подкатегория', 'Сумма, сом', 'Комментарий', 'Договор', 'Вложение']);
    for (const t of rows) {
      ops.addRow([
        fromDbDate(t.date),
        t.type === 'income' ? 'Приход' : 'Расход',
        CATEGORY_LABELS_RU[t.category],
        excelSafe(t.subcategory),
        somNumber(t.amountTyiyn),
        excelSafe(this.cipher.decryptNullable(COMMENT_CONTEXT, t.commentEnc)),
        t.relatedContractId ?? '',
        t.attachmentFileId ? 'да' : '',
      ]);
    }

    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.ACCOUNTING_EXPORTED,
      entityType: 'Transaction',
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { date: `${from}..${to}`, count: rows.length },
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private auditTx(actor: AuthenticatedUser, action: AuditAction, t: Transaction, ctx: RequestContext, extra?: Record<string, unknown>) {
    return this.audit.record({
      actorUserId: actor.id,
      action,
      entityType: 'Transaction',
      entityId: t.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { transactionType: t.type, category: t.category, date: fromDbDate(t.date), ...extra },
    });
  }
}

/** Tyiyn -> som as a spreadsheet number (safe: max realistic totals << 2^53 tyiyn). */
function somNumber(tyiyn: bigint): number {
  return Number(tyiyn) / 100;
}
