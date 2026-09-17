import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AuditResult,
  DailyReport,
  DailyReportType,
  ShiftStatus,
  TransactionCategory,
  TransactionType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { BusinessCalendar, IsoDate, fromDbDate, toDbDate } from '../common/business-calendar.service';
import { Page, pageArgs } from '../common/dto/pagination.dto';
import { decimalToCenti, formatCenti } from '../common/money';
import { FieldCipher } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { USER_PII } from '../users/users.service';
import { ListDailyReportsQueryDto } from './reports.dto';

const CONTENT_CONTEXT = 'DailyReport.content';

export const CATEGORY_LABELS_RU: Record<TransactionCategory, string> = {
  sale_deposit: 'Взносы по договорам',
  sale_full_payment: 'Полная оплата по договорам',
  sale_installment: 'Платежи по рассрочке',
  other_income: 'Прочие поступления',
  construction_materials: 'Строительные материалы',
  contractor_payment: 'Оплата подрядчикам и субподрядчикам',
  payroll: 'Зарплата и налоги сотрудников',
  equipment_rent: 'Аренда техники и оборудования',
  utilities: 'Коммунальные расходы объекта',
  marketing: 'Маркетинг и реклама',
  legal_notary: 'Юридические и нотариальные расходы',
  taxes_corporate: 'Корпоративные налоги и обязательные платежи',
  admin_office: 'Административные и офисные расходы',
  other_expense: 'Непредвиденные расходы',
};

export interface DailyReportResponse {
  id: string;
  type: DailyReportType;
  date: IsoDate;
  generatedAt: Date;
  summary: string;
  data: unknown;
}

/** "3000000" tyiyn -> "30 000,00 сом" */
export function formatSom(tyiyn: bigint): string {
  const negative = tyiyn < 0n;
  const abs = negative ? -tyiyn : tyiyn;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '−' : ''}${whole},${frac} сом`;
}

/**
 * DailyReport generation (TZ_CRM_DEV_v2): closing the accountant's shift
 * produces the day's financial report, closing the head of sales' shift the
 * day's sales report. One report per (type, date); a later regeneration
 * replaces its content. Content is aggregated and encrypted at rest.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly calendar: BusinessCalendar,
    private readonly audit: AuditService,
  ) {}

  async generate(type: DailyReportType, date: IsoDate, sourceShiftId: string | null, actorUserId: string | null): Promise<DailyReport> {
    const content = type === DailyReportType.financial ? await this.financialContent(date) : await this.salesContent(date, sourceShiftId);
    const contentEnc = this.cipher.encrypt(CONTENT_CONTEXT, JSON.stringify(content));
    const report = await this.prisma.dailyReport.upsert({
      where: { type_date: { type, date: toDbDate(date) } },
      create: { type, date: toDbDate(date), contentEnc, sourceShiftId },
      update: { contentEnc, generatedAt: new Date(), sourceShiftId: sourceShiftId ?? undefined },
    });
    await this.audit.record({
      actorUserId,
      action: AuditAction.DAILY_REPORT_GENERATED,
      entityType: 'DailyReport',
      entityId: report.id,
      result: AuditResult.success,
      metadata: { reportType: type, date },
    });
    return report;
  }

  /** Called from shift close: a report failure must not undo the closed shift. */
  async generateSafely(type: DailyReportType, date: IsoDate, sourceShiftId: string, actorUserId: string): Promise<boolean> {
    try {
      await this.generate(type, date, sourceShiftId, actorUserId);
      return true;
    } catch (err) {
      this.logger.error(`Daily ${type} report for ${date} failed: ${(err as Error).message}`);
      await this.audit.record({
        actorUserId,
        action: AuditAction.DAILY_REPORT_GENERATED,
        entityType: 'DailyReport',
        result: AuditResult.failure,
        metadata: { reportType: type, date },
      });
      return false;
    }
  }

  private async financialContent(date: IsoDate) {
    const rows = await this.prisma.transaction.groupBy({
      by: ['type', 'category'],
      where: { date: toDbDate(date) },
      _sum: { amountTyiyn: true },
      _count: { _all: true },
    });
    const byCategory = rows.map((r) => ({
      type: r.type,
      category: r.category,
      label: CATEGORY_LABELS_RU[r.category],
      count: r._count._all,
      amountTyiyn: (r._sum.amountTyiyn ?? 0n).toString(),
    }));
    const sum = (t: TransactionType) =>
      rows.filter((r) => r.type === t).reduce((acc, r) => acc + (r._sum.amountTyiyn ?? 0n), 0n);
    const income = sum(TransactionType.income);
    const expense = sum(TransactionType.expense);

    const lines = [`Финансовый отчёт за ${date}`, `Приходы: ${formatSom(income)}`];
    for (const c of byCategory.filter((c) => c.type === TransactionType.income)) {
      lines.push(`  • ${c.label}: ${formatSom(BigInt(c.amountTyiyn))} (${c.count})`);
    }
    lines.push(`Расходы: ${formatSom(expense)}`);
    for (const c of byCategory.filter((c) => c.type === TransactionType.expense)) {
      lines.push(`  • ${c.label}: ${formatSom(BigInt(c.amountTyiyn))} (${c.count})`);
    }
    lines.push(`Итог дня: ${formatSom(income - expense)}`);

    return {
      summary: lines.join('\n'),
      data: {
        incomeTyiyn: income.toString(),
        expenseTyiyn: expense.toString(),
        netTyiyn: (income - expense).toString(),
        byCategory,
      },
    };
  }

  private async salesContent(date: IsoDate, sourceShiftId: string | null) {
    const { start, endExclusive } = this.calendar.dayBounds(date);
    const createdToday = { createdAt: { gte: start, lt: endExclusive } };

    const [bookings, contracts, deposits] = await Promise.all([
      this.prisma.booking.aggregate({ where: createdToday, _count: { _all: true }, _sum: { desiredAreaSqm: true } }),
      this.prisma.contract.aggregate({
        where: createdToday,
        _count: { _all: true },
        _sum: { areaSqm: true, totalAmountTyiyn: true },
      }),
      this.prisma.contract.aggregate({
        where: { depositPaid: true, depositPaidAt: { gte: start, lt: endExclusive } },
        _count: { _all: true },
        _sum: { depositAmountTyiyn: true },
      }),
    ]);

    // Team attendance: the team of the head of sales whose shift triggered the
    // report (all active sales managers if generated manually).
    let teamLeadId: string | null = null;
    if (sourceShiftId) {
      const shift = await this.prisma.shift.findUnique({ where: { id: sourceShiftId }, select: { userId: true } });
      teamLeadId = shift?.userId ?? null;
    }
    const team = await this.prisma.user.findMany({
      where: {
        role: UserRole.sales_manager,
        status: UserStatus.active,
        ...(teamLeadId ? { teamLeadId } : {}),
        createdAt: { lt: endExclusive },
      },
      select: { id: true, fullName: true },
    });
    const ids = team.map((m) => m.id);
    const [shifts, dayOffs] = await Promise.all([
      this.prisma.shift.findMany({ where: { userId: { in: ids }, date: toDbDate(date) } }),
      this.prisma.dayOff.findMany({ where: { userId: { in: ids }, date: toDbDate(date) } }),
    ]);
    const opened = new Set(shifts.filter((s) => s.status !== ShiftStatus.missed).map((s) => s.userId));
    const onDayOff = new Set(dayOffs.map((d) => d.userId));
    const name = (m: { fullName: string }) => this.cipher.decrypt(USER_PII.fullName, m.fullName);
    const notOpened = team.filter((m) => !opened.has(m.id) && !onDayOff.has(m.id));

    const bookingArea = formatCenti(decimalToCenti(bookings._sum.desiredAreaSqm ?? '0'));
    const contractArea = formatCenti(decimalToCenti(contracts._sum.areaSqm ?? '0'));
    const contractTotal = contracts._sum.totalAmountTyiyn ?? 0n;
    const depositSum = deposits._sum.depositAmountTyiyn ?? 0n;

    const lines = [
      `Отчёт по продажам за ${date}`,
      `Новые бронирования: ${bookings._count._all} (${bookingArea} м²)`,
      `Новые договоры: ${contracts._count._all} (${contractArea} м²) на сумму ${formatSom(contractTotal)}`,
      `Внесённые взносы: ${deposits._count._all} на сумму ${formatSom(depositSum)}`,
      `Команда: открыли смену ${opened.size} из ${team.length}` + (onDayOff.size ? `, выходной у ${onDayOff.size}` : ''),
      notOpened.length ? `Не открыли смену: ${notOpened.map(name).join(', ')}` : 'Все сотрудники открыли смену',
    ];

    return {
      summary: lines.join('\n'),
      data: {
        newBookings: { count: bookings._count._all, areaSqm: bookingArea },
        newContracts: { count: contracts._count._all, areaSqm: contractArea, totalAmountTyiyn: contractTotal.toString() },
        depositsPaid: { count: deposits._count._all, amountTyiyn: depositSum.toString() },
        attendance: {
          teamSize: team.length,
          opened: opened.size,
          onDayOff: onDayOff.size,
          notOpened: notOpened.map((m) => ({ userId: m.id, fullName: name(m) })),
        },
      },
    };
  }

  // ---------------------------------------------------------------------
  // Read access (TZ CRUD): director & investors - all; head of sales - sales
  // reports; accountant - financial reports; sales manager - none.
  // ---------------------------------------------------------------------

  private allowedTypes(actor: AuthenticatedUser): DailyReportType[] {
    switch (actor.role) {
      case UserRole.director:
      case UserRole.investor:
        return [DailyReportType.financial, DailyReportType.sales];
      case UserRole.head_of_sales:
        return [DailyReportType.sales];
      case UserRole.accountant:
        return [DailyReportType.financial];
      default:
        throw new ForbiddenException('AUTH_FORBIDDEN');
    }
  }

  toResponse(report: DailyReport): DailyReportResponse {
    const content = JSON.parse(this.cipher.decrypt(CONTENT_CONTEXT, report.contentEnc)) as { summary: string; data: unknown };
    return {
      id: report.id,
      type: report.type,
      date: fromDbDate(report.date),
      generatedAt: report.generatedAt,
      summary: content.summary,
      data: content.data,
    };
  }

  async list(actor: AuthenticatedUser, q: ListDailyReportsQueryDto): Promise<Page<DailyReportResponse>> {
    const allowed = this.allowedTypes(actor);
    if (q.type && !allowed.includes(q.type)) throw new ForbiddenException('AUTH_FORBIDDEN');
    const where = {
      type: { in: q.type ? [q.type] : allowed },
      ...(q.from || q.to
        ? { date: { ...(q.from ? { gte: toDbDate(q.from) } : {}), ...(q.to ? { lte: toDbDate(q.to) } : {}) } }
        : {}),
    };
    const { take, skip } = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.dailyReport.findMany({ where, take, skip, orderBy: [{ date: 'desc' }, { type: 'asc' }] }),
      this.prisma.dailyReport.count({ where }),
    ]);
    return { items: rows.map((r) => this.toResponse(r)), total, limit: take, offset: skip };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<DailyReportResponse> {
    const report = await this.prisma.dailyReport.findFirst({ where: { id, type: { in: this.allowedTypes(actor) } } });
    if (!report) throw new NotFoundException('REPORT_NOT_FOUND');
    return this.toResponse(report);
  }
}

