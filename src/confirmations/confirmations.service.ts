import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { AuditResult, PendingActionStatus, PendingActionType, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { EmailService } from '../notifications/email.service';
import {
  UsersService,
  CreateUserPayload,
  DisableUserPayload,
  RequestContext,
} from '../users/users.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { EmailDeliveryStatus, InitiateResult, PendingActionSummaryDto } from './confirmations.types';

// Human-typeable-from-email code. Excludes visually ambiguous characters
// (0/O, 1/I/L). 8 characters over this 32-symbol alphabet is ~40 bits of
// entropy - the real protection against brute force is maxAttempts + a
// short TTL + strict per-route rate limiting (see ConfirmationsController),
// not the raw entropy alone (a code has to survive being read from an
// email and typed by a human, unlike a refresh token).
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

/**
 * Maker-checker approval workflow: account creation and disabling are
 * validated and prepared by UsersService (RBAC + business rules enforced
 * immediately, so a forbidden attempt never reaches this service at all),
 * but only actually take effect once a Director confirms a one-time code
 * emailed to every active Director account - regardless of who initiated
 * the request, including a Director acting on themselves.
 *
 * This is an explicit product decision (not derived from the original
 * TЗ), added on top of the existing RBAC foundation for defense in depth.
 */
@Injectable()
export class ConfirmationsService {
  private readonly logger = new Logger(ConfirmationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly usersService: UsersService,
  ) {}

  // ---------------------------------------------------------------------
  // Initiation
  // ---------------------------------------------------------------------

  async initiateCreateUser(
    creator: AuthenticatedUser,
    dto: CreateUserDto,
    ctx: RequestContext = {},
  ): Promise<InitiateResult> {
    // Throws immediately (ForbiddenException/ConflictException) if this
    // isn't allowed - no PendingAction, no email, on a rejected attempt.
    const payload = await this.usersService.prepareCreateUser(creator, dto, ctx);

    return this.createPendingAction(
      PendingActionType.create_user,
      creator.id,
      payload as unknown as Record<string, unknown>,
      `Создание аккаунта "${payload.username}" (роль: ${payload.role}), инициатор: ${creator.username}`,
      ctx,
    );
  }

  async initiateDisableUser(
    actor: AuthenticatedUser,
    targetId: string,
    ctx: RequestContext = {},
  ): Promise<InitiateResult> {
    const payload = await this.usersService.prepareDisableUser(actor, targetId);
    const target = await this.usersService.findById(targetId);

    return this.createPendingAction(
      PendingActionType.disable_user,
      actor.id,
      payload as unknown as Record<string, unknown>,
      `Отключение аккаунта "${target?.username ?? targetId}", инициатор: ${actor.username}`,
      ctx,
    );
  }

  private async createPendingAction(
    type: PendingActionType,
    initiatorId: string,
    payload: Record<string, unknown>,
    humanSummary: string,
    ctx: RequestContext,
  ): Promise<InitiateResult> {
    const code = this.generateCode();
    const codeHash = this.hashCode(code);
    const expiresAt = new Date(Date.now() + this.config.confirmationCodeTtlSeconds * 1000);

    const record = await this.prisma.pendingAction.create({
      data: {
        type,
        initiatorUserId: initiatorId,
        payload: payload as never,
        codeHash,
        maxAttempts: this.config.confirmationCodeMaxAttempts,
        expiresAt,
      },
    });

    await this.audit.record({
      actorUserId: initiatorId,
      action: AuditAction.PENDING_ACTION_CREATED,
      entityType: 'PendingAction',
      entityId: record.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { pendingActionId: record.id, pendingActionType: type },
    });

    const emailDelivery = await this.sendCodeToDirectors(record.id, type, code, humanSummary, ctx);

    return {
      pendingActionId: record.id,
      type,
      status: record.status,
      expiresAt: record.expiresAt,
      emailDelivery,
    };
  }

  private async sendCodeToDirectors(
    pendingActionId: string,
    type: PendingActionType,
    code: string,
    humanSummary: string,
    ctx: RequestContext,
  ): Promise<EmailDeliveryStatus> {
    const recipients = await this.usersService.listDirectorEmails();

    if (recipients.length === 0) {
      this.logger.warn(
        `PendingAction ${pendingActionId}: no Director has an email configured - ` +
          `code can only be retrieved via GET /confirmations/pending by a Director in-app.`,
      );
      return 'no_recipients';
    }

    const minutes = Math.round(this.config.confirmationCodeTtlSeconds / 60);
    try {
      await this.email.send({
        to: recipients,
        subject: `Код подтверждения (${type}) — требуется ваше одобрение`,
        text:
          `${humanSummary}\n\n` +
          `Код подтверждения: ${code}\n` +
          `Код действителен ${minutes} мин. и может быть использован только один раз.\n` +
          `Никому не сообщайте этот код.\n\n` +
          `ID запроса: ${pendingActionId}`,
      });
      return 'sent';
    } catch (err) {
      this.logger.warn(
        `Failed to email confirmation code for PendingAction ${pendingActionId}: ${(err as Error).message}`,
      );
      await this.audit.record({
        action: AuditAction.PENDING_ACTION_EMAIL_FAILED,
        entityType: 'PendingAction',
        entityId: pendingActionId,
        result: AuditResult.failure,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { pendingActionId, recipientCount: recipients.length },
      });
      return 'failed';
    }
  }

  // ---------------------------------------------------------------------
  // Confirmation
  // ---------------------------------------------------------------------

  /**
   * Only a Director may confirm (enforced by @Roles(director) on the
   * controller route - `director` param here is already a verified
   * AuthenticatedUser). Any active Director may confirm any pending
   * action; the confirming Director is recorded (`confirmedByUserId`).
   */
  async confirm(
    director: AuthenticatedUser,
    pendingActionId: string,
    code: string,
    ctx: RequestContext = {},
  ): Promise<User> {
    const record = await this.loadAndExpireIfNeeded(pendingActionId);

    if (record.status !== PendingActionStatus.pending) {
      throw new ConflictException('CONFIRMATION_ALREADY_RESOLVED');
    }

    const providedHash = this.hashCode(code);
    const matches = this.safeCompare(providedHash, record.codeHash);

    if (!matches) {
      const { attempts, exhausted } = await this.recordFailedAttempt(record.id);
      await this.audit.record({
        actorUserId: director.id,
        action: exhausted ? AuditAction.PENDING_ACTION_LOCKED : AuditAction.PENDING_ACTION_CONFIRM_FAILED,
        entityType: 'PendingAction',
        entityId: record.id,
        result: AuditResult.failure,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { pendingActionId: record.id, attempts, maxAttempts: record.maxAttempts },
      });
      throw new UnauthorizedException('CONFIRMATION_CODE_INVALID');
    }

    // Code correct - CLAIM first, execute second. The conditional
    // `pending -> confirmed` write is atomic in PostgreSQL, so when several
    // Directors confirm the same code concurrently exactly one caller wins
    // and runs the underlying action; the others get 409. The expiry is
    // re-checked inside the same write.
    const confirmedAt = new Date();
    const claimed = await this.prisma.pendingAction.updateMany({
      where: { id: record.id, status: PendingActionStatus.pending, expiresAt: { gt: confirmedAt } },
      data: { status: PendingActionStatus.confirmed, confirmedAt, confirmedByUserId: director.id },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('CONFIRMATION_ALREADY_RESOLVED');
    }

    let result: User;
    try {
      if (record.type === PendingActionType.create_user) {
        result = await this.usersService.executeCreateUser(
          record.payload as unknown as CreateUserPayload,
          ctx,
        );
      } else {
        result = await this.usersService.executeDisableUser(
          record.payload as unknown as DisableUserPayload,
          ctx,
        );
      }
    } catch (err) {
      // Only this caller holds the claim, so it is safe to downgrade it.
      await this.prisma.pendingAction.updateMany({
        where: { id: record.id, status: PendingActionStatus.confirmed, confirmedByUserId: director.id },
        data: { status: PendingActionStatus.failed, confirmedAt: null, confirmedByUserId: null },
      });
      await this.audit.record({
        actorUserId: director.id,
        action: AuditAction.PENDING_ACTION_CONFIRM_FAILED,
        entityType: 'PendingAction',
        entityId: record.id,
        result: AuditResult.failure,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { pendingActionId: record.id, reason: 'execution_error' },
      });
      throw err;
    }

    await this.audit.record({
      actorUserId: director.id,
      action: AuditAction.PENDING_ACTION_CONFIRMED,
      entityType: 'PendingAction',
      entityId: record.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { pendingActionId: record.id, pendingActionType: record.type },
    });

    return result;
  }

  /**
   * Counts a wrong code with compare-and-swap on `attempts` (not a blind
   * read-modify-write), so concurrent wrong guesses cannot overwrite each
   * other's increment and slip past maxAttempts.
   */
  private async recordFailedAttempt(id: string): Promise<{ attempts: number; exhausted: boolean }> {
    for (let retry = 0; retry < 10; retry++) {
      const current = await this.prisma.pendingAction.findUnique({ where: { id } });
      if (!current || current.status !== PendingActionStatus.pending) {
        throw new ConflictException('CONFIRMATION_ALREADY_RESOLVED');
      }
      const attempts = current.attempts + 1;
      const exhausted = attempts >= current.maxAttempts;
      const swapped = await this.prisma.pendingAction.updateMany({
        where: { id, status: PendingActionStatus.pending, attempts: current.attempts },
        data: { attempts, status: exhausted ? PendingActionStatus.failed : PendingActionStatus.pending },
      });
      if (swapped.count === 1) return { attempts, exhausted };
    }
    throw new ConflictException('CONFIRMATION_CONCURRENT_UPDATE');
  }

  async reject(director: AuthenticatedUser, pendingActionId: string, ctx: RequestContext = {}): Promise<void> {
    const record = await this.loadAndExpireIfNeeded(pendingActionId);
    if (record.status !== PendingActionStatus.pending) {
      throw new ConflictException('CONFIRMATION_ALREADY_RESOLVED');
    }

    await this.prisma.pendingAction.update({
      where: { id: record.id },
      data: {
        status: PendingActionStatus.rejected,
        rejectedAt: new Date(),
        rejectedByUserId: director.id,
      },
    });

    await this.audit.record({
      actorUserId: director.id,
      action: AuditAction.PENDING_ACTION_REJECTED,
      entityType: 'PendingAction',
      entityId: record.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { pendingActionId: record.id, pendingActionType: record.type },
    });
  }

  async listPending(): Promise<PendingActionSummaryDto[]> {
    const records = await this.prisma.pendingAction.findMany({
      where: { status: PendingActionStatus.pending },
      orderBy: { createdAt: 'desc' },
    });

    const stillPending: PendingActionSummaryDto[] = [];
    for (const record of records) {
      if (record.expiresAt.getTime() < Date.now()) {
        await this.prisma.pendingAction.update({
          where: { id: record.id },
          data: { status: PendingActionStatus.expired },
        });
        await this.audit.record({
          action: AuditAction.PENDING_ACTION_EXPIRED,
          entityType: 'PendingAction',
          entityId: record.id,
          result: AuditResult.success,
          metadata: { pendingActionId: record.id, pendingActionType: record.type },
        });
        continue;
      }
      stillPending.push({
        id: record.id,
        type: record.type,
        status: record.status,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
        initiatorUserId: record.initiatorUserId,
        summary: this.describePayload(record.type, record.payload as unknown as Record<string, unknown>),
      });
    }
    return stillPending;
  }

  private describePayload(type: PendingActionType, payload: Record<string, unknown>): string {
    if (type === PendingActionType.create_user) {
      return `Создание аккаунта "${payload.username as string}" (роль: ${payload.role as string})`;
    }
    return `Отключение аккаунта (id: ${payload.targetUserId as string})`;
  }

  private async loadAndExpireIfNeeded(id: string) {
    const record = await this.prisma.pendingAction.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('PENDING_ACTION_NOT_FOUND');

    if (record.status === PendingActionStatus.pending && record.expiresAt.getTime() < Date.now()) {
      const expired = await this.prisma.pendingAction.update({
        where: { id },
        data: { status: PendingActionStatus.expired },
      });
      await this.audit.record({
        action: AuditAction.PENDING_ACTION_EXPIRED,
        entityType: 'PendingAction',
        entityId: id,
        result: AuditResult.success,
        metadata: { pendingActionId: id, pendingActionType: expired.type },
      });
      return expired;
    }
    return record;
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
    }
    return code;
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code.toUpperCase().trim()).digest('hex');
  }

  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
