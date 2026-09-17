import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, Booking, BookingStatus, Prisma, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { Page, pageArgs } from '../common/dto/pagination.dto';
import { decimalToCenti, formatCenti, parseCenti } from '../common/money';
import { BlindIndexService } from '../crypto/blind-index.service';
import { FieldCipher } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from '../users/users.service';
import { BOOKING_PII, assertBuyerConsentVersion, maskPassport } from './buyer-pii';
import { CreateBookingDto, ListBookingsQueryDto, UpdateBookingDto } from './bookings.dto';
import { SalesAccessService } from './sales-access.service';

export interface BookingResponse {
  id: string;
  fullName: string;
  /** Full value only in the detail view; masked in lists. */
  passportNumber: string;
  phone: string;
  email: string | null;
  desiredAreaSqm: string;
  status: BookingStatus;
  managerId: string;
  contractId: string | null;
  buyerConsentVersion: string;
  buyerConsentConfirmedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type BookingWithContract = Booking & { contract: { id: string } | null };

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly blindIndex: BlindIndexService,
    private readonly access: SalesAccessService,
    private readonly audit: AuditService,
  ) {}

  toResponse(b: BookingWithContract, view: 'list' | 'detail'): BookingResponse {
    const passport = this.cipher.decrypt(BOOKING_PII.passportNumber, b.passportNumberEnc);
    return {
      id: b.id,
      fullName: this.cipher.decrypt(BOOKING_PII.fullName, b.fullNameEnc),
      passportNumber: view === 'detail' ? passport : maskPassport(passport),
      phone: this.cipher.decrypt(BOOKING_PII.phone, b.phoneEnc),
      email: this.cipher.decryptNullable(BOOKING_PII.email, b.emailEnc),
      desiredAreaSqm: formatCenti(decimalToCenti(b.desiredAreaSqm)),
      status: b.status,
      managerId: b.managerId,
      contractId: b.contract?.id ?? null,
      buyerConsentVersion: b.buyerConsentVersion,
      buyerConsentConfirmedAt: b.buyerConsentConfirmedAt,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  }

  async create(actor: AuthenticatedUser, dto: CreateBookingDto, ctx: RequestContext): Promise<BookingResponse> {
    assertBuyerConsentVersion(dto.buyerConsentVersion);
    const managerId = await this.access.resolveManagerId(actor, dto.managerId);
    assertPositiveArea(dto.desiredAreaSqm);

    const booking = await this.prisma.booking.create({
      data: {
        fullNameEnc: this.cipher.encrypt(BOOKING_PII.fullName, dto.fullName),
        passportNumberEnc: this.cipher.encrypt(BOOKING_PII.passportNumber, dto.passportNumber),
        passportNumberIdx: this.blindIndex.passport(dto.passportNumber),
        phoneEnc: this.cipher.encrypt(BOOKING_PII.phone, dto.phone),
        phoneIdx: this.blindIndex.phone(dto.phone),
        emailEnc: this.cipher.encryptNullable(BOOKING_PII.email, dto.email),
        desiredAreaSqm: dto.desiredAreaSqm,
        managerId,
        buyerConsentVersion: dto.buyerConsentVersion,
        buyerConsentConfirmedAt: new Date(),
        buyerConsentRecordedById: actor.id,
      },
      include: { contract: { select: { id: true } } },
    });

    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.BOOKING_CREATED,
      entityType: 'Booking',
      entityId: booking.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return this.toResponse(booking, 'detail');
  }

  async list(actor: AuthenticatedUser, q: ListBookingsQueryDto, ctx: RequestContext): Promise<Page<BookingResponse>> {
    const where: Prisma.BookingWhereInput = {
      ...(await this.access.managerScope(actor)),
      ...(q.status ? { status: q.status } : {}),
    };
    if (q.managerId) where.AND = [{ managerId: q.managerId }];
    if (q.passportNumber) where.passportNumberIdx = this.blindIndex.passport(q.passportNumber);
    if (q.phone) where.phoneIdx = this.blindIndex.phone(q.phone);

    const { take, skip } = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: { contract: { select: { id: true } } },
      }),
      this.prisma.booking.count({ where }),
    ]);

    if (q.passportNumber || q.phone) {
      await this.audit.record({
        actorUserId: actor.id,
        action: AuditAction.PII_ACCESSED,
        entityType: 'Booking',
        result: AuditResult.success,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { view: 'booking_search', searchBy: q.passportNumber ? 'passportNumber' : 'phone', count: rows.length },
      });
    }
    return { items: rows.map((r) => this.toResponse(r, 'list')), total, limit: take, offset: skip };
  }

  /** Loads a booking inside the actor's scope; out-of-scope ids are indistinguishable from missing ones. */
  async findScoped(actor: AuthenticatedUser, id: string): Promise<BookingWithContract> {
    const booking = await this.prisma.booking.findFirst({
      where: { id, ...(await this.access.managerScope(actor)) },
      include: { contract: { select: { id: true } } },
    });
    if (!booking) throw new NotFoundException('BOOKING_NOT_FOUND');
    return booking;
  }

  async get(actor: AuthenticatedUser, id: string, ctx: RequestContext): Promise<BookingResponse> {
    const booking = await this.findScoped(actor, id);
    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.PII_ACCESSED,
      entityType: 'Booking',
      entityId: id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { view: 'booking_detail' },
    });
    return this.toResponse(booking, 'detail');
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateBookingDto, ctx: RequestContext): Promise<BookingResponse> {
    const booking = await this.findScoped(actor, id);
    if (booking.status === BookingStatus.converted) {
      throw new BadRequestException('BOOKING_ALREADY_CONVERTED');
    }

    let managerId: string | undefined;
    if (dto.managerId !== undefined && dto.managerId !== booking.managerId) {
      if (actor.role === UserRole.sales_manager) throw new ForbiddenException('AUTH_FORBIDDEN');
      managerId = await this.access.resolveManagerId(actor, dto.managerId);
    }
    if (dto.desiredAreaSqm !== undefined) assertPositiveArea(dto.desiredAreaSqm);

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        fullNameEnc: dto.fullName === undefined ? undefined : this.cipher.encrypt(BOOKING_PII.fullName, dto.fullName),
        ...(dto.passportNumber === undefined
          ? {}
          : {
              passportNumberEnc: this.cipher.encrypt(BOOKING_PII.passportNumber, dto.passportNumber),
              passportNumberIdx: this.blindIndex.passport(dto.passportNumber),
            }),
        ...(dto.phone === undefined
          ? {}
          : { phoneEnc: this.cipher.encrypt(BOOKING_PII.phone, dto.phone), phoneIdx: this.blindIndex.phone(dto.phone) }),
        emailEnc: dto.email === undefined ? undefined : this.cipher.encryptNullable(BOOKING_PII.email, dto.email),
        desiredAreaSqm: dto.desiredAreaSqm,
        status: dto.status,
        managerId,
      },
      include: { contract: { select: { id: true } } },
    });

    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.BOOKING_UPDATED,
      entityType: 'Booking',
      entityId: id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { fields: changedFields(dto), status: updated.status },
    });
    return this.toResponse(updated, 'detail');
  }

  /** TZ: delete - director (all), head of sales (team); managers cannot delete. */
  async remove(actor: AuthenticatedUser, id: string, ctx: RequestContext): Promise<void> {
    if (actor.role !== UserRole.director && actor.role !== UserRole.head_of_sales) {
      throw new ForbiddenException('AUTH_FORBIDDEN');
    }
    await this.findScoped(actor, id);
    await this.prisma.booking.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.BOOKING_DELETED,
      entityType: 'Booking',
      entityId: id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }
}

export function assertPositiveArea(value: string): void {
  if (parseCenti(value) <= 0n) throw new BadRequestException('AREA_MUST_BE_POSITIVE');
}

export function changedFields(dto: object): string[] {
  return Object.entries(dto)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
}
