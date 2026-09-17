import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditResult, EmailCode, EmailCodePurpose, User } from '@prisma/client';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { AppConfigService } from '../config/app-config.service';
import { FieldCipher } from '../crypto/field-cipher.service';
import { EmailService } from '../notifications/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext, USER_PII } from '../users/users.service';
import { EMAIL_CODE_ACTIONS, EmailCodeAction } from './email-code-actions';

// Same human-typeable alphabet as the Director approval codes (no 0/O, 1/I/L).
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;
const RATE_WINDOW_MS = 15 * 60 * 1000;
export const NEW_EMAIL_CONTEXT = 'EmailCode.newEmail';

export interface IssuedEmailCode {
  challengeId: string;
  expiresAt: Date;
  /** Masked address the code went to, e.g. "di***@gmail.com". */
  emailHint: string;
}

export interface IssueInput {
  user: User;
  purpose: EmailCodePurpose;
  action?: EmailCodeAction;
  resourceId?: string | null;
  /** purpose=email_change: send to this (new) address instead of the current one. */
  newEmail?: string;
  ctx?: RequestContext;
}

export interface ConsumeInput {
  challengeId: string;
  code: string;
  purpose: EmailCodePurpose;
  /** Required for step-up and email-change codes; omitted for login (the user is not known yet). */
  userId?: string;
  action?: EmailCodeAction;
  resourceId?: string | null;
  ctx?: RequestContext;
}

/**
 * One-time codes emailed to the acting user: the second login factor, the
 * step-up confirmation of important actions and the ownership proof of a
 * new email address.
 *
 * - only SHA-256(id:code) is stored, the code never leaves the email;
 * - a code is bound to user + purpose + action + resource and used once
 *   (atomic conditional update, so concurrent requests cannot both win);
 * - EMAIL_CODE_MAX_ATTEMPTS wrong guesses lock it, EMAIL_CODE_TTL_SECONDS
 *   expire it, a newer code of the same kind supersedes it;
 * - at most EMAIL_CODE_MAX_PER_15_MIN codes per user and purpose.
 */
@Injectable()
export class EmailCodesService {
  private readonly logger = new Logger(EmailCodesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly cipher: FieldCipher,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  async issue(input: IssueInput): Promise<IssuedEmailCode> {
    const { user, purpose, ctx = {} } = input;
    const to = input.newEmail ?? this.cipher.decryptNullable(USER_PII.email, user.email);
    if (!to) throw new ForbiddenException('AUTH_EMAIL_NOT_CONFIGURED');
    const action = purpose === EmailCodePurpose.action ? input.action : undefined;
    if (purpose === EmailCodePurpose.action && !action) throw new Error('action is required for purpose=action');
    const resourceId = input.resourceId ?? null;

    const since = new Date(Date.now() - RATE_WINDOW_MS);
    const recent = await this.prisma.emailCode.count({ where: { userId: user.id, purpose, createdAt: { gte: since } } });
    if (recent >= this.config.emailCodeMaxPer15Min) {
      await this.audit.record({
        actorUserId: user.id,
        action: AuditAction.EMAIL_CODE_RATE_LIMITED,
        result: AuditResult.failure,
        ...ctx,
        metadata: { purpose, action },
      });
      throw new HttpException('EMAIL_CODE_RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS);
    }

    // A new code supersedes older unused codes of the same kind.
    const now = new Date();
    await this.prisma.emailCode.updateMany({
      where: { userId: user.id, purpose, action: action ?? null, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: now },
    });

    const id = randomUUID();
    const code = generateCode();
    const record = await this.prisma.emailCode.create({
      data: {
        id,
        userId: user.id,
        purpose,
        action: action ?? null,
        resourceId,
        newEmailEnc: input.newEmail ? this.cipher.encrypt(NEW_EMAIL_CONTEXT, input.newEmail) : null,
        codeHash: hashCode(id, code),
        maxAttempts: this.config.emailCodeMaxAttempts,
        expiresAt: new Date(now.getTime() + this.config.emailCodeTtlSeconds * 1000),
        ip: ctx.ip,
      },
    });

    try {
      await this.email.send({ to: [to], ...this.message(purpose, action, code, record) });
    } catch (err) {
      this.logger.warn(`Email code ${record.id} (${purpose}) not delivered: ${(err as Error).message}`);
      // An undelivered code is useless and must not count towards the per-user
      // limit, otherwise a mail outage locks people out for 15 minutes. The
      // audit event below keeps the trace; login attempts stay IP-throttled.
      await this.prisma.emailCode.delete({ where: { id: record.id } }).catch(() => undefined);
      await this.audit.record({
        actorUserId: user.id,
        action: AuditAction.EMAIL_CODE_DELIVERY_FAILED,
        entityType: 'EmailCode',
        entityId: record.id,
        result: AuditResult.failure,
        ...ctx,
        metadata: { purpose, action },
      });
      throw new ServiceUnavailableException('EMAIL_DELIVERY_FAILED');
    }

    await this.audit.record({
      actorUserId: user.id,
      action: purpose === EmailCodePurpose.login ? AuditAction.LOGIN_CODE_SENT : AuditAction.EMAIL_CODE_SENT,
      entityType: 'EmailCode',
      entityId: record.id,
      result: AuditResult.success,
      ...ctx,
      metadata: { purpose, action, resourceId: resourceId ?? undefined },
    });

    return { challengeId: record.id, expiresAt: record.expiresAt, emailHint: maskEmail(to) };
  }

  /**
   * Verifies and consumes a code. Every mismatch (unknown id, other user,
   * other action/resource) is the same 401 so ids cannot be probed.
   */
  async consume(input: ConsumeInput): Promise<EmailCode> {
    const { ctx = {} } = input;
    const invalid = () => new UnauthorizedException('EMAIL_CODE_INVALID');
    if (!isUuid(input.challengeId) || typeof input.code !== 'string' || input.code.length > 64) throw invalid();

    const record = await this.prisma.emailCode.findUnique({ where: { id: input.challengeId } });
    if (
      !record ||
      record.purpose !== input.purpose ||
      (input.userId !== undefined && record.userId !== input.userId) ||
      (input.purpose === EmailCodePurpose.action &&
        (record.action !== input.action || record.resourceId !== (input.resourceId ?? null)))
    ) {
      throw invalid();
    }
    if (record.consumedAt || record.invalidatedAt) throw new UnauthorizedException('EMAIL_CODE_USED');
    if (record.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('EMAIL_CODE_EXPIRED');
    if (record.attempts >= record.maxAttempts) throw new UnauthorizedException('EMAIL_CODE_LOCKED');

    if (!safeEqualHex(hashCode(record.id, input.code), record.codeHash)) {
      const locked = await this.recordFailedAttempt(record);
      await this.audit.record({
        actorUserId: record.userId,
        action: locked ? AuditAction.EMAIL_CODE_LOCKED : AuditAction.EMAIL_CODE_FAILED,
        entityType: 'EmailCode',
        entityId: record.id,
        result: AuditResult.failure,
        ...ctx,
        metadata: { purpose: record.purpose, action: record.action ?? undefined },
      });
      throw locked ? new UnauthorizedException('EMAIL_CODE_LOCKED') : invalid();
    }

    const consumedAt = new Date();
    const claimed = await this.prisma.emailCode.updateMany({
      where: {
        id: record.id,
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: consumedAt },
        attempts: { lt: record.maxAttempts },
      },
      data: { consumedAt },
    });
    if (claimed.count !== 1) throw new UnauthorizedException('EMAIL_CODE_USED');

    await this.audit.record({
      actorUserId: record.userId,
      action: AuditAction.EMAIL_CODE_VERIFIED,
      entityType: 'EmailCode',
      entityId: record.id,
      result: AuditResult.success,
      ...ctx,
      metadata: { purpose: record.purpose, action: record.action ?? undefined },
    });
    return { ...record, consumedAt };
  }

  /**
   * Gives a consumed step-up code back when the protected request was
   * rejected (validation error, business rule) before changing anything.
   * Only undoes this exact claim.
   */
  async release(record: Pick<EmailCode, 'id' | 'consumedAt'>): Promise<void> {
    if (!record.consumedAt) return;
    await this.prisma.emailCode.updateMany({
      where: { id: record.id, consumedAt: record.consumedAt },
      data: { consumedAt: null },
    });
  }

  private async recordFailedAttempt(record: EmailCode): Promise<boolean> {
    for (let retry = 0; retry < 10; retry++) {
      const current = retry === 0 ? record : await this.prisma.emailCode.findUnique({ where: { id: record.id } });
      if (!current) return true;
      const attempts = current.attempts + 1;
      const swapped = await this.prisma.emailCode.updateMany({
        where: { id: record.id, attempts: current.attempts },
        data: { attempts },
      });
      if (swapped.count === 1) return attempts >= current.maxAttempts;
    }
    return true;
  }

  private message(purpose: EmailCodePurpose, action: EmailCodeAction | undefined, code: string, record: EmailCode) {
    const minutes = Math.round(this.config.emailCodeTtlSeconds / 60);
    const footer =
      `Код действителен ${minutes} мин. и может быть использован только один раз.\n` +
      `Никому не сообщайте этот код, сотрудники компании его не спрашивают.\n` +
      `Если это были не вы — не вводите код, смените пароль и сообщите Директору.\n\n` +
      `ID запроса: ${record.id}`;
    if (purpose === EmailCodePurpose.login) {
      return { subject: 'Код для входа в CRM', text: `Вход в CRM «Улуу Жибек Жолу».\n\nКод подтверждения: ${code}\n${footer}` };
    }
    if (purpose === EmailCodePurpose.email_change) {
      return {
        subject: 'Подтвердите новый email в CRM',
        text: `Этот адрес указан как новый email вашего аккаунта CRM.\n\nКод подтверждения: ${code}\n${footer}`,
      };
    }
    const label = action ? EMAIL_CODE_ACTIONS[action].label : 'Действие';
    return {
      subject: `Код подтверждения: ${label}`,
      text: `Подтверждение действия в CRM: ${label}.\n\nКод подтверждения: ${code}\n${footer}`,
    };
  }
}

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return code;
}

function hashCode(id: string, code: string): string {
  return createHash('sha256').update(`${id}:${code.trim().toUpperCase()}`).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***${email.slice(at)}`;
}
