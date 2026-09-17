import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, DayOff, Prisma, UserRole, UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { BusinessCalendar, IsoDate, fromDbDate, toDbDate } from '../common/business-calendar.service';
import { Page, pageArgs } from '../common/dto/pagination.dto';
import { FieldCipher } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesAccessService } from '../sales/sales-access.service';
import { RequestContext } from '../users/users.service';
import { CreateDayOffDto, DateRangeQueryDto, UpdateDayOffDto } from './attendance.dto';
import { hasShiftButton } from './attendance-access';
import { dateFilter } from './shifts.service';

const REASON_CONTEXT = 'DayOff.reason';

export interface DayOffResponse {
  id: string;
  userId: string;
  date: IsoDate;
  approvedById: string;
  reason: string | null;
  createdAt: Date;
}

/**
 * DayOff = an approved day off agreed IN ADVANCE (TZ). Create/update/delete:
 * director (anyone with a shift button) and head of sales (their team).
 * Only today or future dates, and never a day that already has a shift
 * record - so a recorded "missed" can never be erased retroactively.
 */
@Injectable()
export class DayOffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: BusinessCalendar,
    private readonly cipher: FieldCipher,
    private readonly salesAccess: SalesAccessService,
    private readonly audit: AuditService,
  ) {}

  toResponse(d: DayOff): DayOffResponse {
    return {
      id: d.id,
      userId: d.userId,
      date: fromDbDate(d.date),
      approvedById: d.approvedById,
      reason: this.cipher.decryptNullable(REASON_CONTEXT, d.reasonEnc),
      createdAt: d.createdAt,
    };
  }

  private async assertCanManageFor(actor: AuthenticatedUser, userId: string): Promise<void> {
    if (actor.role === UserRole.head_of_sales) {
      if (!(await this.salesAccess.teamIds(actor.id)).includes(userId)) throw new ForbiddenException('AUTH_FORBIDDEN');
      return;
    }
    if (actor.role !== UserRole.director) throw new ForbiddenException('AUTH_FORBIDDEN');
  }

  private assertNotInPast(date: IsoDate): void {
    if (date < this.calendar.today()) throw new BadRequestException('DAY_OFF_DATE_IN_PAST');
  }

  private async assertNoShiftRecorded(userId: string, date: IsoDate): Promise<void> {
    const shift = await this.prisma.shift.findUnique({ where: { userId_date: { userId, date: toDbDate(date) } } });
    if (shift) throw new ConflictException('SHIFT_ALREADY_RECORDED_FOR_DATE');
  }

  async create(actor: AuthenticatedUser, dto: CreateDayOffDto, ctx: RequestContext): Promise<DayOffResponse> {
    await this.assertCanManageFor(actor, dto.userId);
    this.assertNotInPast(dto.date);
    const employee = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!employee || employee.status !== UserStatus.active || !hasShiftButton(employee.role)) {
      throw new BadRequestException('DAY_OFF_EMPLOYEE_INVALID');
    }
    await this.assertNoShiftRecorded(dto.userId, dto.date);

    let dayOff: DayOff;
    try {
      dayOff = await this.prisma.dayOff.create({
        data: {
          userId: dto.userId,
          date: toDbDate(dto.date),
          approvedById: actor.id,
          reasonEnc: this.cipher.encryptNullable(REASON_CONTEXT, dto.reason),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('DAY_OFF_ALREADY_EXISTS');
      }
      throw err;
    }
    await this.auditDayOff(actor.id, AuditAction.DAY_OFF_CREATED, dayOff, ctx);
    return this.toResponse(dayOff);
  }

  /** Read (TZ): director & accountant - all; head of sales - team; sales manager - own. */
  async list(actor: AuthenticatedUser, q: DateRangeQueryDto): Promise<Page<DayOffResponse>> {
    let scope: Prisma.DayOffWhereInput;
    switch (actor.role) {
      case UserRole.director:
      case UserRole.accountant:
        scope = {};
        break;
      case UserRole.head_of_sales:
        scope = { userId: { in: await this.salesAccess.teamIds(actor.id) } };
        break;
      case UserRole.sales_manager:
        scope = { userId: actor.id };
        break;
      default:
        throw new ForbiddenException('AUTH_FORBIDDEN');
    }
    const where: Prisma.DayOffWhereInput = { ...scope, ...dateFilter(q.from, q.to) };
    if (q.userId) where.AND = [{ userId: q.userId }];
    const { take, skip } = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.dayOff.findMany({ where, take, skip, orderBy: { date: 'desc' } }),
      this.prisma.dayOff.count({ where }),
    ]);
    return { items: rows.map((r) => this.toResponse(r)), total, limit: take, offset: skip };
  }

  private async findManageable(actor: AuthenticatedUser, id: string): Promise<DayOff> {
    const dayOff = await this.prisma.dayOff.findUnique({ where: { id } });
    if (!dayOff) throw new NotFoundException('DAY_OFF_NOT_FOUND');
    try {
      await this.assertCanManageFor(actor, dayOff.userId);
    } catch {
      throw new NotFoundException('DAY_OFF_NOT_FOUND');
    }
    this.assertNotInPast(fromDbDate(dayOff.date));
    return dayOff;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateDayOffDto, ctx: RequestContext): Promise<DayOffResponse> {
    const dayOff = await this.findManageable(actor, id);
    if (dto.date !== undefined) {
      this.assertNotInPast(dto.date);
      await this.assertNoShiftRecorded(dayOff.userId, dto.date);
    }
    let updated: DayOff;
    try {
      updated = await this.prisma.dayOff.update({
        where: { id },
        data: {
          date: dto.date === undefined ? undefined : toDbDate(dto.date),
          reasonEnc: dto.reason === undefined ? undefined : this.cipher.encryptNullable(REASON_CONTEXT, dto.reason),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('DAY_OFF_ALREADY_EXISTS');
      }
      throw err;
    }
    await this.auditDayOff(actor.id, AuditAction.DAY_OFF_UPDATED, updated, ctx);
    return this.toResponse(updated);
  }

  async remove(actor: AuthenticatedUser, id: string, ctx: RequestContext): Promise<void> {
    const dayOff = await this.findManageable(actor, id);
    await this.prisma.dayOff.delete({ where: { id } });
    await this.auditDayOff(actor.id, AuditAction.DAY_OFF_DELETED, dayOff, ctx);
  }

  private auditDayOff(actorId: string, action: AuditAction, d: DayOff, ctx: RequestContext) {
    return this.audit.record({
      actorUserId: actorId,
      action,
      entityType: 'DayOff',
      entityId: d.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { targetUserId: d.userId, date: fromDbDate(d.date) },
    });
  }
}
