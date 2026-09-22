import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditResult, DailyReportType, Prisma, Shift, ShiftStatus, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { BusinessCalendar, IsoDate, fromDbDate, toDbDate } from '../common/business-calendar.service';
import { Page, pageArgs } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { SalesAccessService } from '../sales/sales-access.service';
import { RequestContext } from '../users/users.service';
import { CorrectShiftDto, ListShiftsQueryDto } from './attendance.dto';
import { hasShiftButton } from './attendance-access';

export interface ShiftResponse {
  id: string;
  userId: string;
  date: IsoDate;
  openedAt: Date | null;
  closedAt: Date | null;
  status: ShiftStatus;
  createdAt: Date;
}

export function toShiftResponse(s: Shift): ShiftResponse {
  return {
    id: s.id,
    userId: s.userId,
    date: fromDbDate(s.date),
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    status: s.status,
    createdAt: s.createdAt,
  };
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: BusinessCalendar,
    private readonly reports: ReportsService,
    private readonly salesAccess: SalesAccessService,
    private readonly audit: AuditService,
  ) {}

  /** "Открыть смену": one shift per employee per business day, only for today. */
  async open(actor: AuthenticatedUser, ctx: RequestContext): Promise<ShiftResponse> {
    if (!hasShiftButton(actor.role)) throw new ForbiddenException('SHIFT_NOT_APPLICABLE');

    const stillOpen = await this.prisma.shift.findFirst({ where: { userId: actor.id, status: ShiftStatus.open } });
    if (stillOpen) throw new ConflictException('PREVIOUS_SHIFT_NOT_CLOSED');

    const today = this.calendar.today();
    let shift: Shift;
    try {
      shift = await this.prisma.shift.create({
        data: { userId: actor.id, date: toDbDate(today), openedAt: new Date(), status: ShiftStatus.open },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('SHIFT_ALREADY_EXISTS_FOR_TODAY');
      }
      throw err;
    }
    await this.auditShift(actor.id, AuditAction.SHIFT_OPENED, shift, ctx);
    return toShiftResponse(shift);
  }

  /**
   * "Завершить смену". Closing the accountant's shift generates the day's
   * financial report; closing the head of sales' shift - the sales report.
   */
  async close(actor: AuthenticatedUser, ctx: RequestContext): Promise<ShiftResponse & { reportGenerated: DailyReportType | null }> {
    if (!hasShiftButton(actor.role)) throw new ForbiddenException('SHIFT_NOT_APPLICABLE');

    const shift = await this.prisma.shift.findFirst({
      where: { userId: actor.id, status: ShiftStatus.open },
      orderBy: { date: 'desc' },
    });
    if (!shift) throw new ConflictException('NO_OPEN_SHIFT');

    const claimed = await this.prisma.shift.updateMany({
      where: { id: shift.id, status: ShiftStatus.open },
      data: { status: ShiftStatus.closed, closedAt: new Date() },
    });
    if (claimed.count !== 1) throw new ConflictException('NO_OPEN_SHIFT');
    const closed = await this.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } });
    await this.auditShift(actor.id, AuditAction.SHIFT_CLOSED, closed, ctx);

    const type =
      actor.role === UserRole.accountant
        ? DailyReportType.financial
        : actor.role === UserRole.head_of_sales
          ? DailyReportType.sales
          : null;
    let reportGenerated: DailyReportType | null = null;
    if (type && (await this.reports.generateSafely(type, fromDbDate(closed.date), closed.id, actor.id))) {
      reportGenerated = type;
    }
    return { ...toShiftResponse(closed), reportGenerated };
  }

  async current(actor: AuthenticatedUser): Promise<ShiftResponse | null> {
    if (!hasShiftButton(actor.role)) throw new ForbiddenException('SHIFT_NOT_APPLICABLE');
    const shift = await this.prisma.shift.findFirst({
      where: { userId: actor.id, OR: [{ status: ShiftStatus.open }, { date: toDbDate(this.calendar.today()) }] },
      orderBy: { date: 'desc' },
    });
    return shift ? toShiftResponse(shift) : null;
  }

  /**
   * Read scope (TZ): director - all; accountant - all; head of sales - team +
   * own; sales manager - own; investor - none.
   */
  private async userScope(actor: AuthenticatedUser): Promise<{ userId?: { in: string[] } }> {
    switch (actor.role) {
      case UserRole.director:
      case UserRole.accountant:
        return {};
      case UserRole.head_of_sales:
        return { userId: { in: [actor.id, ...(await this.salesAccess.teamIds(actor.id))] } };
      case UserRole.sales_manager:
        return { userId: { in: [actor.id] } };
      default:
        throw new ForbiddenException('AUTH_FORBIDDEN');
    }
  }

  async list(actor: AuthenticatedUser, q: ListShiftsQueryDto): Promise<Page<ShiftResponse>> {
    const where: Prisma.ShiftWhereInput = {
      ...(await this.userScope(actor)),
      ...(q.status ? { status: q.status } : {}),
      ...dateFilter(q.from, q.to),
    };
    if (q.userId) where.AND = [{ userId: q.userId }];
    const { take, skip } = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.shift.findMany({ where, take, skip, orderBy: [{ date: 'desc' }, { userId: 'asc' }] }),
      this.prisma.shift.count({ where }),
    ]);
    return { items: rows.map(toShiftResponse), total, limit: take, offset: skip };
  }

  /** Director-only correction. A head of sales cannot remove a recorded "missed" (TZ). */
  // correct() и remove() удалены 22.09.2026 вместе с эндпоинтами: правка и
  // удаление смены были только у директора, а у него осталась лишь
  // отчётность и создание аккаунтов. Кода, способного изменить закрытую
  // смену, в сервисе больше нет.

  private auditShift(actorId: string, action: AuditAction, shift: Shift, ctx: RequestContext) {
    return this.audit.record({
      actorUserId: actorId,
      action,
      entityType: 'Shift',
      entityId: shift.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { targetUserId: shift.userId, date: fromDbDate(shift.date), status: shift.status },
    });
  }
}

export function dateFilter(from?: string, to?: string): { date?: { gte?: Date; lte?: Date } } {
  if (!from && !to) return {};
  if (from && to && from > to) throw new BadRequestException('DATE_RANGE_INVALID');
  return { date: { ...(from ? { gte: toDbDate(from) } : {}), ...(to ? { lte: toDbDate(to) } : {}) } };
}
