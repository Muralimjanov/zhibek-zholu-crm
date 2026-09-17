import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditResult, BookingStatus, Contract, ContractStatus, Prisma, StoredFilePurpose, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { Page, pageArgs } from '../common/dto/pagination.dto';
import {
  assertFitsBigint,
  contractTotal,
  decimalToCenti,
  formatCenti,
  parseCenti,
  parseTyiyn,
  percentOf,
} from '../common/money';
import { BlindIndexService } from '../crypto/blind-index.service';
import { FieldCipher } from '../crypto/field-cipher.service';
import { DecryptedFile, FileStorageService, UploadedFileInput } from '../files/file-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from '../users/users.service';
import { BOOKING_PII, CONTRACT_PII, assertBuyerConsentVersion, maskPassport } from './buyer-pii';
import { ConvertBookingDto } from './bookings.dto';
import { assertPositiveArea, changedFields } from './bookings.service';
import { CreateContractDto, ListContractsQueryDto, UpdateContractDto } from './contracts.dto';
import { SalesAccessService } from './sales-access.service';

export interface ContractFinanceView {
  id: string;
  status: ContractStatus;
  areaSqm: string;
  pricePerSqmTyiyn: string;
  totalAmountTyiyn: string;
  depositPercent: string;
  depositAmountTyiyn: string;
  depositPaid: boolean;
  depositPaidAt: Date | null;
  hasFile: boolean;
  managerId: string;
  bookingId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContractResponse extends ContractFinanceView {
  fullName: string;
  passportNumber: string;
  address: string;
  phone: string;
  email: string | null;
  buyerConsentVersion: string;
  buyerConsentConfirmedAt: Date;
}

/** TZ: signed = deposit paid AND contract file attached. */
export function deriveContractStatus(depositPaid: boolean, hasFile: boolean): ContractStatus {
  if (depositPaid && hasFile) return ContractStatus.signed;
  if (depositPaid) return ContractStatus.deposit_paid;
  return ContractStatus.draft;
}

export function computeAmounts(areaSqm: string, pricePerSqmTyiyn: string, depositPercent: string) {
  const areaCenti = parseCenti(areaSqm);
  const percentCenti = parseCenti(depositPercent);
  if (areaCenti <= 0n) throw new BadRequestException('AREA_MUST_BE_POSITIVE');
  if (percentCenti > 10_000n) throw new BadRequestException('DEPOSIT_PERCENT_OUT_OF_RANGE');
  try {
    const total = assertFitsBigint(contractTotal(areaCenti, parseTyiyn(pricePerSqmTyiyn)), 'totalAmountTyiyn');
    const deposit = assertFitsBigint(percentOf(total, percentCenti), 'depositAmountTyiyn');
    return { totalAmountTyiyn: total, depositAmountTyiyn: deposit };
  } catch (err) {
    if (err instanceof RangeError) throw new BadRequestException('AMOUNT_OUT_OF_RANGE');
    throw err;
  }
}

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly blindIndex: BlindIndexService,
    private readonly access: SalesAccessService,
    private readonly files: FileStorageService,
    private readonly audit: AuditService,
  ) {}

  toFinanceView(c: Contract): ContractFinanceView {
    return {
      id: c.id,
      status: c.status,
      areaSqm: formatCenti(decimalToCenti(c.areaSqm)),
      pricePerSqmTyiyn: c.pricePerSqmTyiyn.toString(),
      totalAmountTyiyn: c.totalAmountTyiyn.toString(),
      depositPercent: formatCenti(decimalToCenti(c.depositPercent)),
      depositAmountTyiyn: c.depositAmountTyiyn.toString(),
      depositPaid: c.depositPaid,
      depositPaidAt: c.depositPaidAt,
      hasFile: c.contractFileId !== null,
      managerId: c.managerId,
      bookingId: c.bookingId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  toResponse(c: Contract, view: 'list' | 'detail'): ContractResponse {
    const passport = this.cipher.decrypt(CONTRACT_PII.passportNumber, c.passportNumberEnc);
    return {
      ...this.toFinanceView(c),
      fullName: this.cipher.decrypt(CONTRACT_PII.fullName, c.fullNameEnc),
      passportNumber: view === 'detail' ? passport : maskPassport(passport),
      address: this.cipher.decrypt(CONTRACT_PII.address, c.addressEnc),
      phone: this.cipher.decrypt(CONTRACT_PII.phone, c.phoneEnc),
      email: this.cipher.decryptNullable(CONTRACT_PII.email, c.emailEnc),
      buyerConsentVersion: c.buyerConsentVersion,
      buyerConsentConfirmedAt: c.buyerConsentConfirmedAt,
    };
  }

  // ---------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------

  async create(actor: AuthenticatedUser, dto: CreateContractDto, ctx: RequestContext): Promise<ContractResponse> {
    assertBuyerConsentVersion(dto.buyerConsentVersion);
    const managerId = await this.access.resolveManagerId(actor, dto.managerId);
    const depositPercent = dto.depositPercent ?? '30';
    const amounts = computeAmounts(dto.areaSqm, dto.pricePerSqmTyiyn, depositPercent);

    const contract = await this.prisma.contract.create({
      data: {
        fullNameEnc: this.cipher.encrypt(CONTRACT_PII.fullName, dto.fullName),
        passportNumberEnc: this.cipher.encrypt(CONTRACT_PII.passportNumber, dto.passportNumber),
        passportNumberIdx: this.blindIndex.passport(dto.passportNumber),
        addressEnc: this.cipher.encrypt(CONTRACT_PII.address, dto.address),
        phoneEnc: this.cipher.encrypt(CONTRACT_PII.phone, dto.phone),
        phoneIdx: this.blindIndex.phone(dto.phone),
        emailEnc: this.cipher.encryptNullable(CONTRACT_PII.email, dto.email),
        areaSqm: dto.areaSqm,
        pricePerSqmTyiyn: parseTyiyn(dto.pricePerSqmTyiyn),
        depositPercent,
        ...amounts,
        managerId,
        buyerConsentVersion: dto.buyerConsentVersion,
        buyerConsentConfirmedAt: new Date(),
        buyerConsentRecordedById: actor.id,
      },
    });
    await this.auditEvent(actor, AuditAction.CONTRACT_CREATED, contract.id, ctx);
    return this.toResponse(contract, 'detail');
  }

  /**
   * Booking -> Contract in one DB transaction. The booking is atomically
   * flipped active -> converted first, so two concurrent conversions cannot
   * create two contracts (the loser gets 409).
   */
  async createFromBooking(
    actor: AuthenticatedUser,
    bookingId: string,
    dto: ConvertBookingDto,
    ctx: RequestContext,
  ): Promise<ContractResponse> {
    assertBuyerConsentVersion(dto.buyerConsentVersion);
    const scope = await this.access.managerScope(actor);
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, ...scope } });
    if (!booking) throw new NotFoundException('BOOKING_NOT_FOUND');
    if (booking.status !== BookingStatus.active) throw new ConflictException('BOOKING_NOT_ACTIVE');

    const areaSqm = dto.areaSqm ?? formatCenti(decimalToCenti(booking.desiredAreaSqm));
    const depositPercent = dto.depositPercent ?? '30';
    const amounts = computeAmounts(areaSqm, dto.pricePerSqmTyiyn, depositPercent);

    // Ciphertexts are bound to their column context, so re-encrypt under Contract.*.
    const fullName = this.cipher.decrypt(BOOKING_PII.fullName, booking.fullNameEnc);
    const passport = this.cipher.decrypt(BOOKING_PII.passportNumber, booking.passportNumberEnc);
    const phone = this.cipher.decrypt(BOOKING_PII.phone, booking.phoneEnc);
    const email = this.cipher.decryptNullable(BOOKING_PII.email, booking.emailEnc);

    const contract = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.booking.updateMany({
        where: { id: booking.id, status: BookingStatus.active },
        data: { status: BookingStatus.converted },
      });
      if (claimed.count !== 1) throw new ConflictException('BOOKING_NOT_ACTIVE');

      return tx.contract.create({
        data: {
          bookingId: booking.id,
          fullNameEnc: this.cipher.encrypt(CONTRACT_PII.fullName, fullName),
          passportNumberEnc: this.cipher.encrypt(CONTRACT_PII.passportNumber, passport),
          passportNumberIdx: booking.passportNumberIdx,
          addressEnc: this.cipher.encrypt(CONTRACT_PII.address, dto.address),
          phoneEnc: this.cipher.encrypt(CONTRACT_PII.phone, phone),
          phoneIdx: booking.phoneIdx,
          emailEnc: this.cipher.encryptNullable(CONTRACT_PII.email, email),
          areaSqm,
          pricePerSqmTyiyn: parseTyiyn(dto.pricePerSqmTyiyn),
          depositPercent,
          ...amounts,
          managerId: booking.managerId,
          buyerConsentVersion: dto.buyerConsentVersion,
          buyerConsentConfirmedAt: new Date(),
          buyerConsentRecordedById: actor.id,
        },
      });
    });

    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.BOOKING_CONVERTED,
      entityType: 'Booking',
      entityId: booking.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { bookingId: booking.id, contractId: contract.id },
    });
    return this.toResponse(contract, 'detail');
  }

  // ---------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------

  async list(actor: AuthenticatedUser, q: ListContractsQueryDto, ctx: RequestContext): Promise<Page<ContractResponse | ContractFinanceView>> {
    const isAccountant = actor.role === UserRole.accountant;
    if (isAccountant && (q.passportNumber || q.phone)) {
      // The accountant's view carries no buyer PII, so no PII search either.
      throw new ForbiddenException('AUTH_FORBIDDEN');
    }
    const where: Prisma.ContractWhereInput = {
      ...(isAccountant ? {} : await this.access.managerScope(actor)),
      ...(q.status ? { status: q.status } : {}),
    };
    if (q.managerId) where.AND = [{ managerId: q.managerId }];
    if (q.passportNumber) where.passportNumberIdx = this.blindIndex.passport(q.passportNumber);
    if (q.phone) where.phoneIdx = this.blindIndex.phone(q.phone);

    const { take, skip } = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.contract.findMany({ where, take, skip, orderBy: { createdAt: 'desc' } }),
      this.prisma.contract.count({ where }),
    ]);

    if (q.passportNumber || q.phone) {
      await this.audit.record({
        actorUserId: actor.id,
        action: AuditAction.PII_ACCESSED,
        entityType: 'Contract',
        result: AuditResult.success,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { view: 'contract_search', searchBy: q.passportNumber ? 'passportNumber' : 'phone', count: rows.length },
      });
    }
    const items = rows.map((r) => (isAccountant ? this.toFinanceView(r) : this.toResponse(r, 'list')));
    return { items, total, limit: take, offset: skip };
  }

  private async findScoped(actor: AuthenticatedUser, id: string): Promise<Contract> {
    const scope = actor.role === UserRole.accountant ? {} : await this.access.managerScope(actor);
    const contract = await this.prisma.contract.findFirst({ where: { id, ...scope } });
    if (!contract) throw new NotFoundException('CONTRACT_NOT_FOUND');
    return contract;
  }

  async get(actor: AuthenticatedUser, id: string, ctx: RequestContext): Promise<ContractResponse | ContractFinanceView> {
    const contract = await this.findScoped(actor, id);
    if (actor.role === UserRole.accountant) return this.toFinanceView(contract);
    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.PII_ACCESSED,
      entityType: 'Contract',
      entityId: id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { view: 'contract_detail' },
    });
    return this.toResponse(contract, 'detail');
  }

  // ---------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------

  /** Sellers only; a sales manager loses edit rights once the contract is signed (TZ "до signed"). */
  private async findEditable(actor: AuthenticatedUser, id: string): Promise<Contract> {
    if (actor.role === UserRole.accountant || actor.role === UserRole.investor) {
      throw new ForbiddenException('AUTH_FORBIDDEN');
    }
    const contract = await this.findScoped(actor, id);
    if (actor.role === UserRole.sales_manager && contract.status === ContractStatus.signed) {
      throw new ForbiddenException('CONTRACT_SIGNED_READ_ONLY');
    }
    return contract;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateContractDto, ctx: RequestContext): Promise<ContractResponse> {
    const contract = await this.findEditable(actor, id);

    let managerId: string | undefined;
    if (dto.managerId !== undefined && dto.managerId !== contract.managerId) {
      if (actor.role === UserRole.sales_manager) throw new ForbiddenException('AUTH_FORBIDDEN');
      managerId = await this.access.resolveManagerId(actor, dto.managerId);
    }

    const areaSqm = dto.areaSqm ?? formatCenti(decimalToCenti(contract.areaSqm));
    const price = dto.pricePerSqmTyiyn ?? contract.pricePerSqmTyiyn.toString();
    const percent = dto.depositPercent ?? formatCenti(decimalToCenti(contract.depositPercent));
    if (dto.areaSqm !== undefined) assertPositiveArea(dto.areaSqm);
    const amounts = computeAmounts(areaSqm, price, percent);

    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        fullNameEnc: dto.fullName === undefined ? undefined : this.cipher.encrypt(CONTRACT_PII.fullName, dto.fullName),
        ...(dto.passportNumber === undefined
          ? {}
          : {
              passportNumberEnc: this.cipher.encrypt(CONTRACT_PII.passportNumber, dto.passportNumber),
              passportNumberIdx: this.blindIndex.passport(dto.passportNumber),
            }),
        addressEnc: dto.address === undefined ? undefined : this.cipher.encrypt(CONTRACT_PII.address, dto.address),
        ...(dto.phone === undefined
          ? {}
          : { phoneEnc: this.cipher.encrypt(CONTRACT_PII.phone, dto.phone), phoneIdx: this.blindIndex.phone(dto.phone) }),
        emailEnc: dto.email === undefined ? undefined : this.cipher.encryptNullable(CONTRACT_PII.email, dto.email),
        areaSqm,
        pricePerSqmTyiyn: parseTyiyn(price),
        depositPercent: percent,
        ...amounts,
        managerId,
      },
    });

    await this.auditEvent(actor, AuditAction.CONTRACT_UPDATED, id, ctx, { fields: changedFields(dto), status: updated.status });
    return this.toResponse(updated, 'detail');
  }

  /**
   * "Отметка оплаты". Marking paid: sellers in scope (manager until signed)
   * and the accountant. Un-marking (a correction) is not available to a
   * sales manager.
   */
  async markDeposit(actor: AuthenticatedUser, id: string, paid: boolean, ctx: RequestContext): Promise<ContractFinanceView | ContractResponse> {
    if (actor.role === UserRole.investor) throw new ForbiddenException('AUTH_FORBIDDEN');
    const contract =
      actor.role === UserRole.accountant ? await this.findScoped(actor, id) : await this.findEditable(actor, id);
    if (!paid && actor.role === UserRole.sales_manager) throw new ForbiddenException('AUTH_FORBIDDEN');

    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        depositPaid: paid,
        depositPaidAt: paid ? (contract.depositPaidAt ?? new Date()) : null,
        depositMarkedById: actor.id,
        status: deriveContractStatus(paid, contract.contractFileId !== null),
      },
    });
    await this.auditEvent(actor, AuditAction.CONTRACT_DEPOSIT_MARKED, id, ctx, { paid, status: updated.status });
    return actor.role === UserRole.accountant ? this.toFinanceView(updated) : this.toResponse(updated, 'detail');
  }

  async attachFile(actor: AuthenticatedUser, id: string, file: UploadedFileInput | undefined, ctx: RequestContext): Promise<ContractResponse> {
    const contract = await this.findEditable(actor, id);
    const stored = await this.files.store(StoredFilePurpose.contract_document, actor.id, file);

    let updated: Contract;
    try {
      updated = await this.prisma.contract.update({
        where: { id },
        data: { contractFileId: stored.id, status: deriveContractStatus(contract.depositPaid, true) },
      });
    } catch (err) {
      await this.files.remove(stored.id);
      throw err;
    }
    await this.files.remove(contract.contractFileId);
    await this.auditEvent(actor, AuditAction.CONTRACT_FILE_UPLOADED, id, ctx, { fileId: stored.id, status: updated.status });
    return this.toResponse(updated, 'detail');
  }

  async downloadFile(actor: AuthenticatedUser, id: string, ctx: RequestContext): Promise<DecryptedFile> {
    if (actor.role === UserRole.accountant || actor.role === UserRole.investor) {
      throw new ForbiddenException('AUTH_FORBIDDEN');
    }
    const contract = await this.findScoped(actor, id);
    if (!contract.contractFileId) throw new NotFoundException('FILE_NOT_FOUND');
    const file = await this.files.read(contract.contractFileId);
    await this.auditEvent(actor, AuditAction.FILE_DOWNLOADED, id, ctx, { fileId: contract.contractFileId, purpose: 'contract_document' });
    return file;
  }

  /** TZ: delete - director (all), head of sales (team). */
  async remove(actor: AuthenticatedUser, id: string, ctx: RequestContext): Promise<void> {
    if (actor.role !== UserRole.director && actor.role !== UserRole.head_of_sales) {
      throw new ForbiddenException('AUTH_FORBIDDEN');
    }
    const contract = await this.findScoped(actor, id);
    await this.prisma.contract.delete({ where: { id } });
    await this.files.remove(contract.contractFileId);
    await this.auditEvent(actor, AuditAction.CONTRACT_DELETED, id, ctx);
  }

  private auditEvent(actor: AuthenticatedUser, action: AuditAction, id: string, ctx: RequestContext, metadata?: Record<string, unknown>) {
    return this.audit.record({
      actorUserId: actor.id,
      action,
      entityType: 'Contract',
      entityId: id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { contractId: id, ...metadata },
    });
  }
}
