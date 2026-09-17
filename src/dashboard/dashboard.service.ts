import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { BookingStatus, ContractStatus, PayrollEntryStatus, ShiftStatus, UserRole, UserStatus } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { BusinessCalendar, IsoDate, periodOf, toDbDate } from '../common/business-calendar.service';
import { decimalToCenti, formatCenti } from '../common/money';
import { FieldCipher } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesAccessService } from '../sales/sales-access.service';
import { USER_PII } from '../users/users.service';

function sumCenti(values: Array<{ toString(): string } | null>): string {
  return formatCenti(values.reduce<bigint>((acc, v) => acc + (v ? decimalToCenti(v) : 0n), 0n));
}

/**
 * Aggregated views. Nothing here returns buyer PII: investors are read-only
 * observers who get "Отчёты" (aggregates) for bookings, contracts, payroll
 * and accounting (TZ CRUD matrix).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: BusinessCalendar,
    private readonly accounting: AccountingService,
    private readonly salesAccess: SalesAccessService,
    private readonly cipher: FieldCipher,
  ) {}

  resolveRange(from?: IsoDate, to?: IsoDate): { from: IsoDate; to: IsoDate } {
    const today = this.calendar.today();
    const range = { from: from ?? `${periodOf(today)}-01`, to: to ?? today };
    if (range.from > range.to) throw new BadRequestException('DATE_RANGE_INVALID');
    return range;
  }

  /** Director & investors: company-wide summary for [from, to]. */
  async summary(from?: IsoDate, to?: IsoDate) {
    const range = this.resolveRange(from, to);
    const start = this.calendar.dayBounds(range.from).start;
    const end = this.calendar.dayBounds(range.to).endExclusive;
    const created = { createdAt: { gte: start, lt: end } };

    const [bookingGroups, contractGroups, deposits, payroll, missed, accounting] = await Promise.all([
      this.prisma.booking.groupBy({ by: ['status'], where: created, _count: { _all: true }, _sum: { desiredAreaSqm: true } }),
      this.prisma.contract.groupBy({
        by: ['status'],
        where: created,
        _count: { _all: true },
        _sum: { areaSqm: true, totalAmountTyiyn: true },
      }),
      this.prisma.contract.aggregate({
        where: { depositPaid: true, depositPaidAt: { gte: start, lt: end } },
        _count: { _all: true },
        _sum: { depositAmountTyiyn: true },
      }),
      this.prisma.payrollEntry.aggregate({
        where: { status: PayrollEntryStatus.confirmed, period: { gte: periodOf(range.from), lte: periodOf(range.to) } },
        _count: { _all: true },
        _sum: { finalAmountTyiyn: true, taxAmountTyiyn: true, fineAmountTyiyn: true },
      }),
      this.prisma.shift.count({
        where: { status: ShiftStatus.missed, date: { gte: toDbDate(range.from), lte: toDbDate(range.to) } },
      }),
      this.accounting.summary(range.from, range.to),
    ]);

    return {
      ...range,
      bookings: Object.values(BookingStatus).map((status) => {
        const g = bookingGroups.find((x) => x.status === status);
        return { status, count: g?._count._all ?? 0, areaSqm: sumCenti([g?._sum.desiredAreaSqm ?? null]) };
      }),
      contracts: Object.values(ContractStatus).map((status) => {
        const g = contractGroups.find((x) => x.status === status);
        return {
          status,
          count: g?._count._all ?? 0,
          areaSqm: sumCenti([g?._sum.areaSqm ?? null]),
          totalAmountTyiyn: (g?._sum.totalAmountTyiyn ?? 0n).toString(),
        };
      }),
      depositsPaid: { count: deposits._count._all, amountTyiyn: (deposits._sum.depositAmountTyiyn ?? 0n).toString() },
      payrollConfirmed: {
        entries: payroll._count._all,
        finalAmountTyiyn: (payroll._sum.finalAmountTyiyn ?? 0n).toString(),
        taxAmountTyiyn: (payroll._sum.taxAmountTyiyn ?? 0n).toString(),
        fineAmountTyiyn: (payroll._sum.fineAmountTyiyn ?? 0n).toString(),
      },
      attendance: { missedShifts: missed },
      accounting: {
        incomeTyiyn: accounting.incomeTyiyn,
        expenseTyiyn: accounting.expenseTyiyn,
        netTyiyn: accounting.netTyiyn,
        byCategory: accounting.byCategory,
      },
    };
  }

  /** Director (all sellers) and head of sales (team + self): per-manager sales and attendance. */
  async salesAnalytics(actor: AuthenticatedUser, from?: IsoDate, to?: IsoDate) {
    const range = this.resolveRange(from, to);
    const start = this.calendar.dayBounds(range.from).start;
    const end = this.calendar.dayBounds(range.to).endExclusive;

    let sellerIds: string[];
    if (actor.role === UserRole.director) {
      const sellers = await this.prisma.user.findMany({
        where: { role: { in: [UserRole.sales_manager, UserRole.head_of_sales] }, status: UserStatus.active },
        select: { id: true },
      });
      sellerIds = sellers.map((s) => s.id);
    } else if (actor.role === UserRole.head_of_sales) {
      sellerIds = [actor.id, ...(await this.salesAccess.teamIds(actor.id))];
    } else {
      throw new ForbiddenException('AUTH_FORBIDDEN');
    }

    const created = { createdAt: { gte: start, lt: end }, managerId: { in: sellerIds } };
    const dateRange = { gte: toDbDate(range.from), lte: toDbDate(range.to) };
    const [users, bookings, signed, shifts, dayOffs] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, fullName: true, role: true } }),
      this.prisma.booking.groupBy({ by: ['managerId'], where: created, _count: { _all: true }, _sum: { desiredAreaSqm: true } }),
      this.prisma.contract.groupBy({
        by: ['managerId'],
        where: { ...created, status: ContractStatus.signed },
        _count: { _all: true },
        _sum: { areaSqm: true, totalAmountTyiyn: true },
      }),
      this.prisma.shift.groupBy({ by: ['userId', 'status'], where: { userId: { in: sellerIds }, date: dateRange }, _count: { _all: true } }),
      this.prisma.dayOff.groupBy({ by: ['userId'], where: { userId: { in: sellerIds }, date: dateRange }, _count: { _all: true } }),
    ]);

    const perManager = users.map((u) => {
      const b = bookings.find((x) => x.managerId === u.id);
      const s = signed.find((x) => x.managerId === u.id);
      const shiftCount = (status: ShiftStatus) =>
        shifts.filter((x) => x.userId === u.id && x.status === status).reduce((acc, x) => acc + x._count._all, 0);
      return {
        userId: u.id,
        fullName: this.cipher.decrypt(USER_PII.fullName, u.fullName),
        role: u.role,
        bookings: { count: b?._count._all ?? 0, areaSqm: sumCenti([b?._sum.desiredAreaSqm ?? null]) },
        signedContracts: {
          count: s?._count._all ?? 0,
          areaSqm: sumCenti([s?._sum.areaSqm ?? null]),
          totalAmountTyiyn: (s?._sum.totalAmountTyiyn ?? 0n).toString(),
        },
        attendance: {
          workedShifts: shiftCount(ShiftStatus.closed) + shiftCount(ShiftStatus.open),
          missedShifts: shiftCount(ShiftStatus.missed),
          dayOffs: dayOffs.find((x) => x.userId === u.id)?._count._all ?? 0,
        },
      };
    });

    return {
      ...range,
      totals: {
        bookedAreaSqm: sumCenti(bookings.map((b) => b._sum.desiredAreaSqm)),
        soldAreaSqm: sumCenti(signed.map((s) => s._sum.areaSqm)),
        soldAmountTyiyn: signed.reduce((acc, s) => acc + (s._sum.totalAmountTyiyn ?? 0n), 0n).toString(),
      },
      perManager,
    };
  }
}
