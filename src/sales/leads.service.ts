import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, Lead, LeadStatus, Prisma, UserRole, UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { Page, pageArgs } from '../common/dto/pagination.dto';
import { decimalToCenti, formatCenti } from '../common/money';
import { BlindIndexService } from '../crypto/blind-index.service';
import { FieldCipher } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from '../users/users.service';
import { BOOKING_PII, LEAD_PII, assertBuyerConsentVersion } from './buyer-pii';
import { AssignLeadDto, ConvertLeadDto, CreateLeadDto, ListLeadsQueryDto } from './leads.dto';
import { SalesAccessService } from './sales-access.service';

export interface LeadResponse {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  desiredAreaSqm: string;
  comment: string | null;
  status: LeadStatus;
  createdById: string;
  assignedManagerId: string | null;
  assignedAt: Date | null;
  bookingId: string | null;
  buyerConsentVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Лиды — первый шаг воронки: ресепшен регистрирует обращение, начальник
 * продаж назначает менеджера, менеджер превращает лид в бронь.
 *
 * Видимость (та же логика, что у броней, но по назначенному менеджеру):
 *   reception      — только то, что завёл сам (проверить свою же запись);
 *   sales_manager  — только назначенные ему;
 *   head_of_sales  — нераспределённые + лиды своей команды;
 *   director       — все, но только на чтение (правок у директора нет);
 *   accountant, investor — доступа нет.
 */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly blindIndex: BlindIndexService,
    private readonly access: SalesAccessService,
    private readonly audit: AuditService,
  ) {}

  toResponse(lead: Lead): LeadResponse {
    return {
      id: lead.id,
      firstName: this.cipher.decrypt(LEAD_PII.firstName, lead.firstNameEnc),
      lastName: this.cipher.decrypt(LEAD_PII.lastName, lead.lastNameEnc),
      phone: this.cipher.decrypt(LEAD_PII.phone, lead.phoneEnc),
      desiredAreaSqm: formatCenti(decimalToCenti(lead.desiredAreaSqm)),
      comment: this.cipher.decryptNullable(LEAD_PII.comment, lead.commentEnc),
      status: lead.status,
      createdById: lead.createdById,
      assignedManagerId: lead.assignedManagerId,
      assignedAt: lead.assignedAt,
      bookingId: lead.bookingId,
      buyerConsentVersion: lead.buyerConsentVersion,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
  }

  /** Фрагмент `where`, ограничивающий выдачу правами роли. */
  private async scope(actor: AuthenticatedUser): Promise<Prisma.LeadWhereInput> {
    switch (actor.role) {
      case UserRole.director:
        return {};
      case UserRole.head_of_sales:
        return {
          OR: [
            { assignedManagerId: null },
            { assignedManagerId: { in: [actor.id, ...(await this.access.teamIds(actor.id))] } },
          ],
        };
      case UserRole.sales_manager:
        return { assignedManagerId: actor.id };
      case UserRole.reception:
        return { createdById: actor.id };
      default:
        throw new ForbiddenException('AUTH_FORBIDDEN');
    }
  }

  async create(actor: AuthenticatedUser, dto: CreateLeadDto, ctx: RequestContext): Promise<LeadResponse> {
    assertBuyerConsentVersion(dto.buyerConsentVersion);

    const lead = await this.prisma.lead.create({
      data: {
        firstNameEnc: this.cipher.encrypt(LEAD_PII.firstName, dto.firstName.trim()),
        lastNameEnc: this.cipher.encrypt(LEAD_PII.lastName, dto.lastName.trim()),
        phoneEnc: this.cipher.encrypt(LEAD_PII.phone, dto.phone),
        phoneIdx: this.blindIndex.phone(dto.phone),
        commentEnc: this.cipher.encryptNullable(LEAD_PII.comment, dto.comment),
        desiredAreaSqm: dto.desiredAreaSqm,
        createdById: actor.id,
        buyerConsentVersion: dto.buyerConsentVersion,
        buyerConsentConfirmedAt: new Date(),
        buyerConsentRecordedById: actor.id,
      },
    });

    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.LEAD_CREATED,
      entityType: 'Lead',
      entityId: lead.id,
      result: AuditResult.success,
      ...ctx,
    });
    return this.toResponse(lead);
  }

  async list(actor: AuthenticatedUser, query: ListLeadsQueryDto): Promise<Page<LeadResponse>> {
    const where: Prisma.LeadWhereInput = {
      AND: [
        await this.scope(actor),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.managerId ? [{ assignedManagerId: query.managerId }] : []),
      ],
    };
    const { take, skip } = pageArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      this.prisma.lead.count({ where }),
    ]);
    return { items: items.map((l) => this.toResponse(l)), total, limit: take, offset: skip };
  }

  /** Лид в пределах прав актора; чужой id просто не находится (404, не 403). */
  private async findInScope(actor: AuthenticatedUser, id: string): Promise<Lead> {
    const lead = await this.prisma.lead.findFirst({ where: { AND: [{ id }, await this.scope(actor)] } });
    if (!lead) throw new NotFoundException('LEAD_NOT_FOUND');
    return lead;
  }

  async get(actor: AuthenticatedUser, id: string, ctx: RequestContext): Promise<LeadResponse> {
    const lead = await this.findInScope(actor, id);
    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.PII_ACCESSED,
      entityType: 'Lead',
      entityId: lead.id,
      result: AuditResult.success,
      ...ctx,
    });
    return this.toResponse(lead);
  }

  /** Начальник продаж отдаёт лид менеджеру своей команды. */
  async assign(actor: AuthenticatedUser, id: string, dto: AssignLeadDto, ctx: RequestContext): Promise<LeadResponse> {
    const lead = await this.findInScope(actor, id);
    if (lead.status === LeadStatus.converted) throw new ConflictException('LEAD_ALREADY_CONVERTED');
    if (lead.status === LeadStatus.rejected) throw new ConflictException('LEAD_REJECTED');

    const team = await this.access.teamIds(actor.id);
    if (dto.managerId !== actor.id && !team.includes(dto.managerId)) throw new ForbiddenException('AUTH_FORBIDDEN');
    const manager = await this.prisma.user.findUnique({ where: { id: dto.managerId } });
    if (!manager || manager.status !== UserStatus.active) throw new BadRequestException('MANAGER_INVALID');

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { assignedManagerId: dto.managerId, assignedAt: new Date(), status: LeadStatus.assigned },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.LEAD_ASSIGNED,
      entityType: 'Lead',
      entityId: lead.id,
      result: AuditResult.success,
      ...ctx,
      metadata: { managerId: dto.managerId },
    });
    return this.toResponse(updated);
  }

  /** Нецелевое обращение или отказ клиента. */
  async reject(actor: AuthenticatedUser, id: string, ctx: RequestContext): Promise<LeadResponse> {
    const lead = await this.findInScope(actor, id);
    if (lead.status === LeadStatus.converted) throw new ConflictException('LEAD_ALREADY_CONVERTED');

    const updated = await this.prisma.lead.update({ where: { id: lead.id }, data: { status: LeadStatus.rejected } });
    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.LEAD_REJECTED,
      entityType: 'Lead',
      entityId: lead.id,
      result: AuditResult.success,
      ...ctx,
    });
    return this.toResponse(updated);
  }

  /**
   * Лид становится бронью. Имя, телефон и площадь переносятся из лида,
   * паспорт и согласие покупателя добавляет менеджер при встрече.
   *
   * Обе записи меняются одной транзакцией, а переход статуса выполняется
   * условным обновлением: два одновременных вызова не создадут две брони.
   */
  async convert(actor: AuthenticatedUser, id: string, dto: ConvertLeadDto, ctx: RequestContext): Promise<{ bookingId: string; lead: LeadResponse }> {
    assertBuyerConsentVersion(dto.buyerConsentVersion);
    const lead = await this.findInScope(actor, id);
    if (lead.status === LeadStatus.converted) throw new ConflictException('LEAD_ALREADY_CONVERTED');
    if (lead.status === LeadStatus.rejected) throw new ConflictException('LEAD_REJECTED');
    if (!lead.assignedManagerId) throw new ConflictException('LEAD_NOT_ASSIGNED');
    if (actor.role === UserRole.sales_manager && lead.assignedManagerId !== actor.id) {
      throw new ForbiddenException('AUTH_FORBIDDEN');
    }

    const firstName = this.cipher.decrypt(LEAD_PII.firstName, lead.firstNameEnc);
    const lastName = this.cipher.decrypt(LEAD_PII.lastName, lead.lastNameEnc);
    const phone = this.cipher.decrypt(LEAD_PII.phone, lead.phoneEnc);

    const bookingId = await this.prisma.$transaction(async (tx) => {
      // Бронь создаётся первой: ограничение Lead_converted_has_booking требует,
      // чтобы статус converted и ссылка на бронь появились одним обновлением.
      const booking = await tx.booking.create({
        data: {
          fullNameEnc: this.cipher.encrypt(BOOKING_PII.fullName, `${lastName} ${firstName}`),
          passportNumberEnc: this.cipher.encrypt(BOOKING_PII.passportNumber, dto.passportNumber),
          passportNumberIdx: this.blindIndex.passport(dto.passportNumber),
          phoneEnc: this.cipher.encrypt(BOOKING_PII.phone, phone),
          phoneIdx: this.blindIndex.phone(phone),
          emailEnc: this.cipher.encryptNullable(BOOKING_PII.email, dto.email),
          desiredAreaSqm: lead.desiredAreaSqm,
          managerId: lead.assignedManagerId as string,
          buyerConsentVersion: dto.buyerConsentVersion,
          buyerConsentConfirmedAt: new Date(),
          buyerConsentRecordedById: actor.id,
        },
      });
      // Условный переход статуса: два одновременных вызова не создадут две
      // брони — проигравший откатит всю транзакцию вместе со своей бронью.
      const claimed = await tx.lead.updateMany({
        where: { id: lead.id, status: { in: [LeadStatus.new, LeadStatus.assigned] }, bookingId: null },
        data: { status: LeadStatus.converted, bookingId: booking.id },
      });
      if (claimed.count !== 1) throw new ConflictException('LEAD_ALREADY_CONVERTED');
      return booking.id;
    });

    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.LEAD_CONVERTED,
      entityType: 'Lead',
      entityId: lead.id,
      result: AuditResult.success,
      ...ctx,
      metadata: { bookingId },
    });

    const updated = await this.prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    return { bookingId, lead: this.toResponse(updated) };
  }
}
