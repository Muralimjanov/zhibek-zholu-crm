import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditResult,
  PayrollEntry,
  PayrollEntryStatus,
  PayrollSettings,
  Prisma,
  ShiftStatus,
  User,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { SHIFT_ROLES } from '../attendance/attendance-access';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { BusinessCalendar, periodOf, periodRange } from '../common/business-calendar.service';
import { assertFitsBigint, decimalToCenti, formatCenti, parseCenti, parseTyiyn, percentOf } from '../common/money';
import { FieldCipher } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext, USER_PII } from '../users/users.service';
import { ListPayrollQueryDto, PayrollSettingsDto, UpdatePayrollEntryDto } from './payroll.dto';

export interface PayrollEntryResponse {
  id: string;
  userId: string;
  employeeFullName: string;
  employeeRole: UserRole;
  period: string;
  baseSalaryTyiyn: string;
  missedShiftsCount: number;
  finePerMissedShiftTyiyn: string;
  fineAmountTyiyn: string;
  fineManuallyAdjusted: boolean;
  taxRatePercent: string;
  taxAmountTyiyn: string;
  finalAmountTyiyn: string;
  status: PayrollEntryStatus;
  confirmedById: string | null;
  confirmedAt: Date | null;
}

/**
 * TZ formulas:
 *   fine_amount  = missed_shifts_count × fine_per_missed_shift (manual override allowed before confirm)
 *   tax_amount   = base_salary × tax_rate_percent / 100
 *   final_amount = base_salary − fine_amount − tax_amount
 * OPEN QUESTION: final_amount may be negative when fines exceed the salary;
 * it is not clamped.
 */
export function computePayroll(base: bigint, missed: number, finePerMissed: bigint, taxRateCenti: bigint, fineOverride?: bigint) {
  const fine = assertFitsBigint(fineOverride ?? BigInt(missed) * finePerMissed, 'fineAmountTyiyn');
  const tax = assertFitsBigint(percentOf(base, taxRateCenti), 'taxAmountTyiyn');
  return { fineAmountTyiyn: fine, taxAmountTyiyn: tax, finalAmountTyiyn: base - fine - tax };
}

type EntryWithUser = PayrollEntry & { user: Pick<User, 'fullName' | 'role'> };

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: BusinessCalendar,
    private readonly cipher: FieldCipher,
    private readonly audit: AuditService,
  ) {}

  private toResponse(e: EntryWithUser): PayrollEntryResponse {
    return {
      id: e.id,
      userId: e.userId,
      employeeFullName: this.cipher.decrypt(USER_PII.fullName, e.user.fullName),
      employeeRole: e.user.role,
      period: e.period,
      baseSalaryTyiyn: e.baseSalaryTyiyn.toString(),
      missedShiftsCount: e.missedShiftsCount,
      finePerMissedShiftTyiyn: e.finePerMissedShiftTyiyn.toString(),
      fineAmountTyiyn: e.fineAmountTyiyn.toString(),
      fineManuallyAdjusted: e.fineManuallyAdjusted,
      taxRatePercent: formatCenti(decimalToCenti(e.taxRatePercent)),
      taxAmountTyiyn: e.taxAmountTyiyn.toString(),
      finalAmountTyiyn: e.finalAmountTyiyn.toString(),
      status: e.status,
      confirmedById: e.confirmedById,
      confirmedAt: e.confirmedAt,
    };
  }

  // --- Settings (accountant writes; director & accountant read) ------------

  async getSettings(): Promise<{ finePerMissedShiftTyiyn: string; taxRatePercent: string; updatedAt: Date } | null> {
    const s = await this.prisma.payrollSettings.findUnique({ where: { id: 1 } });
    return s ? settingsResponse(s) : null;
  }

  async putSettings(actor: AuthenticatedUser, dto: PayrollSettingsDto, ctx: RequestContext) {
    if (parseCenti(dto.taxRatePercent) > 10_000n) throw new BadRequestException('TAX_RATE_OUT_OF_RANGE');
    const data = {
      finePerMissedShiftTyiyn: parseTyiyn(dto.finePerMissedShiftTyiyn),
      taxRatePercent: dto.taxRatePercent,
      updatedById: actor.id,
    };
    const s = await this.prisma.payrollSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.PAYROLL_SETTINGS_UPDATED,
      entityType: 'PayrollSettings',
      entityId: '1',
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return settingsResponse(s);
  }

  // --- Generation ------------------------------------------------------------

  private async missedCount(userId: string, period: string): Promise<number> {
    const { start, endExclusive } = periodRange(period);
    return this.prisma.shift.count({
      where: { userId, status: ShiftStatus.missed, date: { gte: start, lt: endExclusive } },
    });
  }

  /**
   * Creates draft entries for every active employee with a shift button
   * (head_of_sales, sales_manager, accountant). Existing drafts are refreshed
   * (missed count, current rates); confirmed entries are never touched.
   * base_salary: OPEN QUESTION - the TZ has no salary field on the user; the
   * last confirmed entry's value is carried over, otherwise 0 for the
   * accountant to fill in.
   */
  async generate(actor: AuthenticatedUser, period: string, ctx: RequestContext): Promise<PayrollEntryResponse[]> {
    if (period > periodOf(this.calendar.today())) throw new BadRequestException('PAYROLL_PERIOD_IN_FUTURE');
    const settings = await this.prisma.payrollSettings.findUnique({ where: { id: 1 } });
    if (!settings) throw new ConflictException('PAYROLL_SETTINGS_REQUIRED');
    const taxCenti = decimalToCenti(settings.taxRatePercent);
    const { endExclusive } = periodRange(period);

    const employees = await this.prisma.user.findMany({
      where: { role: { in: SHIFT_ROLES }, status: UserStatus.active, createdAt: { lt: endExclusive } },
      select: { id: true },
    });

    for (const { id: userId } of employees) {
      const missed = await this.missedCount(userId, period);
      const existing = await this.prisma.payrollEntry.findUnique({ where: { userId_period: { userId, period } } });
      if (existing?.status === PayrollEntryStatus.confirmed) continue;

      if (existing) {
        const amounts = computePayroll(
          existing.baseSalaryTyiyn,
          missed,
          settings.finePerMissedShiftTyiyn,
          taxCenti,
          existing.fineManuallyAdjusted ? existing.fineAmountTyiyn : undefined,
        );
        await this.prisma.payrollEntry.updateMany({
          where: { id: existing.id, status: PayrollEntryStatus.draft },
          data: {
            missedShiftsCount: missed,
            finePerMissedShiftTyiyn: settings.finePerMissedShiftTyiyn,
            taxRatePercent: settings.taxRatePercent,
            ...amounts,
          },
        });
        continue;
      }

      const previous = await this.prisma.payrollEntry.findFirst({
        where: { userId, status: PayrollEntryStatus.confirmed, period: { lt: period } },
        orderBy: { period: 'desc' },
      });
      const base = previous?.baseSalaryTyiyn ?? 0n;
      try {
        await this.prisma.payrollEntry.create({
          data: {
            userId,
            period,
            baseSalaryTyiyn: base,
            missedShiftsCount: missed,
            finePerMissedShiftTyiyn: settings.finePerMissedShiftTyiyn,
            taxRatePercent: settings.taxRatePercent,
            ...computePayroll(base, missed, settings.finePerMissedShiftTyiyn, taxCenti),
          },
        });
      } catch (err) {
        // A concurrent generate created it first - fine, it is idempotent.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }

    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.PAYROLL_GENERATED,
      entityType: 'PayrollEntry',
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { period, count: employees.length },
    });
    return this.list(actor, { period });
  }

  // --- Read (TZ): director & accountant - all; sales manager - own. ----------

  private scope(actor: AuthenticatedUser): Prisma.PayrollEntryWhereInput {
    switch (actor.role) {
      case UserRole.director:
      case UserRole.accountant:
        return {};
      case UserRole.sales_manager:
        return { userId: actor.id };
      default:
        throw new ForbiddenException('AUTH_FORBIDDEN');
    }
  }

  async list(actor: AuthenticatedUser, q: ListPayrollQueryDto): Promise<PayrollEntryResponse[]> {
    const where: Prisma.PayrollEntryWhereInput = {
      ...this.scope(actor),
      ...(q.period ? { period: q.period } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    if (q.userId) where.AND = [{ userId: q.userId }];
    const rows = await this.prisma.payrollEntry.findMany({
      where,
      orderBy: [{ period: 'desc' }, { createdAt: 'asc' }],
      take: 500,
      include: { user: { select: { fullName: true, role: true } } },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async get(actor: AuthenticatedUser, id: string): Promise<PayrollEntryResponse> {
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { id, ...this.scope(actor) },
      include: { user: { select: { fullName: true, role: true } } },
    });
    if (!entry) throw new NotFoundException('PAYROLL_ENTRY_NOT_FOUND');
    return this.toResponse(entry);
  }

  // --- Update / confirm (accountant), delete (director) ------------------------

  async update(actor: AuthenticatedUser, id: string, dto: UpdatePayrollEntryDto, ctx: RequestContext): Promise<PayrollEntryResponse> {
    const entry = await this.prisma.payrollEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('PAYROLL_ENTRY_NOT_FOUND');
    if (entry.status !== PayrollEntryStatus.draft) throw new ConflictException('PAYROLL_ENTRY_CONFIRMED');

    const base = dto.baseSalaryTyiyn === undefined ? entry.baseSalaryTyiyn : parseTyiyn(dto.baseSalaryTyiyn);
    const manualFine =
      dto.fineAmountTyiyn !== undefined
        ? parseTyiyn(dto.fineAmountTyiyn)
        : entry.fineManuallyAdjusted
          ? entry.fineAmountTyiyn
          : undefined;
    const amounts = computePayroll(
      base,
      entry.missedShiftsCount,
      entry.finePerMissedShiftTyiyn,
      decimalToCenti(entry.taxRatePercent),
      manualFine,
    );

    const claimed = await this.prisma.payrollEntry.updateMany({
      where: { id, status: PayrollEntryStatus.draft },
      data: { baseSalaryTyiyn: base, fineManuallyAdjusted: manualFine !== undefined, ...amounts },
    });
    if (claimed.count !== 1) throw new ConflictException('PAYROLL_ENTRY_CONFIRMED');

    await this.auditEntry(actor, AuditAction.PAYROLL_ENTRY_UPDATED, entry, ctx, {
      fields: Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined),
    });
    return this.get(actor, id);
  }

  async confirm(actor: AuthenticatedUser, id: string, ctx: RequestContext): Promise<PayrollEntryResponse> {
    const entry = await this.prisma.payrollEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('PAYROLL_ENTRY_NOT_FOUND');
    const claimed = await this.prisma.payrollEntry.updateMany({
      where: { id, status: PayrollEntryStatus.draft },
      data: { status: PayrollEntryStatus.confirmed, confirmedById: actor.id, confirmedAt: new Date() },
    });
    if (claimed.count !== 1) throw new ConflictException('PAYROLL_ENTRY_CONFIRMED');
    await this.auditEntry(actor, AuditAction.PAYROLL_ENTRY_CONFIRMED, entry, ctx);
    return this.get(actor, id);
  }

  async remove(actor: AuthenticatedUser, id: string, ctx: RequestContext): Promise<void> {
    const entry = await this.prisma.payrollEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('PAYROLL_ENTRY_NOT_FOUND');
    await this.prisma.payrollEntry.delete({ where: { id } });
    await this.auditEntry(actor, AuditAction.PAYROLL_ENTRY_DELETED, entry, ctx);
  }

  private auditEntry(actor: AuthenticatedUser, action: AuditAction, e: PayrollEntry, ctx: RequestContext, extra?: Record<string, unknown>) {
    return this.audit.record({
      actorUserId: actor.id,
      action,
      entityType: 'PayrollEntry',
      entityId: e.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { targetUserId: e.userId, period: e.period, ...extra },
    });
  }
}

function settingsResponse(s: PayrollSettings) {
  return {
    finePerMissedShiftTyiyn: s.finePerMissedShiftTyiyn.toString(),
    taxRatePercent: formatCenti(decimalToCenti(s.taxRatePercent)),
    updatedAt: s.updatedAt,
  };
}
