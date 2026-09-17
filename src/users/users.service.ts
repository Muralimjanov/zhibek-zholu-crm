import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditResult, EmailCodePurpose, Prisma, User, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { canCreateRole } from '../common/constants/role-hierarchy';
import { FieldCipher } from '../crypto/field-cipher.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import type { EmailCodesService, IssuedEmailCode } from '../email-codes/email-codes.service';
import { EmailService } from '../notifications/email.service';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

/** FieldCipher contexts (AES-GCM associated data) for employee PII. */
export const USER_PII = {
  fullName: 'User.fullName',
  phone: 'User.phone',
  email: 'User.email',
} as const;

/** Execution-ready payload for a `create_user` PendingAction. Never
 * contains the plaintext password (only its Argon2id hash) and never
 * plaintext PII: fullName/phone/email are already encrypted at PREPARE time,
 * so the PendingAction row is as protected as the final User row. */
export interface CreateUserPayload {
  username: string;
  passwordHash: string;
  fullNameEnc: string;
  phoneEnc?: string;
  emailEnc: string;
  role: UserRole;
  initiatorId: string;
}

export interface DisableUserPayload {
  targetUserId: string;
  actorId: string;
}

const NEW_EMAIL_CONTEXT = 'EmailCode.newEmail';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  /** Set by EmailCodesModule (avoids a module import cycle). */
  emailCodes?: EmailCodesService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly audit: AuditService,
    private readonly cipher: FieldCipher,
    private readonly email?: EmailService,
  ) {}

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** The only way a User leaves the service layer: explicit allowlist, PII decrypted. */
  toResponse(user: User): UserResponseDto {
    return UserResponseDto.from({
      id: user.id,
      username: user.username,
      fullName: this.cipher.decrypt(USER_PII.fullName, user.fullName),
      phone: this.cipher.decryptNullable(USER_PII.phone, user.phone),
      email: this.cipher.decryptNullable(USER_PII.email, user.email),
      emailVerified: user.emailVerifiedAt !== null && user.emailVerifiedAt !== undefined,
      hasAvatar: user.avatarFileId !== null,
      role: user.role,
      status: user.status,
      teamLeadId: user.teamLeadId,
      createdAt: user.createdAt,
    });
  }

  decryptFullName(user: Pick<User, 'fullName'>): string {
    return this.cipher.decrypt(USER_PII.fullName, user.fullName);
  }

  async listDirectorEmails(): Promise<string[]> {
    const directors = await this.prisma.user.findMany({
      where: { role: UserRole.director, status: UserStatus.active, email: { not: null } },
    });
    return directors
      .map((d: User) => this.cipher.decryptNullable(USER_PII.email, d.email))
      .filter((e: string | null): e is string => Boolean(e));
  }

  /** Active sales managers in a head of sales' team. */
  async teamMemberIds(teamLeadId: string): Promise<string[]> {
    const members = await this.prisma.user.findMany({
      where: { teamLeadId, role: UserRole.sales_manager },
      select: { id: true },
    });
    return members.map((m) => m.id);
  }

  // ---------------------------------------------------------------------
  // Account creation: PREPARE validates + hashes + encrypts, EXECUTE writes.
  // The gap between the two is exactly where ConfirmationsService inserts
  // the Director email-code approval step.
  // ---------------------------------------------------------------------

  /**
   * Validates RBAC (role-creation matrix) and username uniqueness, hashes the
   * password and encrypts PII. Throws immediately on any violation - a
   * forbidden attempt never results in a PendingAction or an email.
   */
  async prepareCreateUser(
    creator: AuthenticatedUser,
    dto: CreateUserDto,
    ctx: RequestContext = {},
  ): Promise<CreateUserPayload> {
    if (!canCreateRole(creator.role, dto.role)) {
      await this.audit.record({
        actorUserId: creator.id,
        action: AuditAction.USER_CREATION_FORBIDDEN,
        entityType: 'User',
        result: AuditResult.failure,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { requestedRole: dto.role },
      });
      throw new ForbiddenException('USER_ROLE_CREATION_FORBIDDEN');
    }

    const existing = await this.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException('USERNAME_TAKEN');
    }
    if (await this.isEmailTaken(dto.email)) {
      throw new ConflictException('EMAIL_TAKEN');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    return {
      username: dto.username,
      passwordHash,
      fullNameEnc: this.cipher.encrypt(USER_PII.fullName, dto.fullName),
      phoneEnc: dto.phone === undefined ? undefined : this.cipher.encrypt(USER_PII.phone, dto.phone),
      emailEnc: this.cipher.encrypt(USER_PII.email, normalizeEmail(dto.email)),
      role: dto.role,
      initiatorId: creator.id,
    };
  }

  /**
   * Performs the actual write. Re-checks username uniqueness (the payload
   * may be minutes old by confirmation time - race/staleness safety), and
   * re-validates the creator still has the role required by the matrix
   * (in case their role changed between initiation and confirmation).
   */
  async executeCreateUser(payload: CreateUserPayload, ctx: RequestContext = {}): Promise<User> {
    const initiator = await this.findById(payload.initiatorId);
    if (!initiator || !canCreateRole(initiator.role, payload.role)) {
      throw new ForbiddenException('USER_ROLE_CREATION_FORBIDDEN');
    }

    let user: User;
    try {
      user = await this.withIdentityLock(async (tx) => {
        const stillTaken = await this.findByUsername(payload.username);
        if (stillTaken) {
          throw new ConflictException('USERNAME_TAKEN');
        }
        if (payload.emailEnc && (await this.isEmailTaken(this.cipher.decrypt(USER_PII.email, payload.emailEnc)))) {
          throw new ConflictException('EMAIL_TAKEN');
        }
        return tx.user.create({
          data: {
            username: payload.username,
            passwordHash: payload.passwordHash,
            fullName: payload.fullNameEnc,
            phone: payload.phoneEnc,
            email: payload.emailEnc,
            role: payload.role,
            createdById: payload.initiatorId,
            // TZ: a head of sales manages the team of managers they create.
            teamLeadId:
              payload.role === UserRole.sales_manager && initiator.role === UserRole.head_of_sales
                ? initiator.id
                : undefined,
          },
        });
      });
    } catch (err) {
      // The DB unique constraint on username is the last line of defence.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('USERNAME_TAKEN');
      }
      throw err;
    }

    await this.audit.record({
      actorUserId: payload.initiatorId,
      action: AuditAction.USER_CREATED,
      entityType: 'User',
      entityId: user.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { targetUserId: user.id, targetRole: user.role },
    });

    return user;
  }

  // ---------------------------------------------------------------------
  // Account disable: same prepare/execute split.
  // ---------------------------------------------------------------------

  async prepareDisableUser(actor: AuthenticatedUser, targetId: string): Promise<DisableUserPayload> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('USER_NOT_FOUND');

    const isDirector = actor.role === UserRole.director;
    const isDirectCreator = target.createdById === actor.id;
    if (!isDirector && !isDirectCreator) {
      throw new ForbiddenException('AUTH_FORBIDDEN');
    }

    return { targetUserId: targetId, actorId: actor.id };
  }

  async executeDisableUser(payload: DisableUserPayload, ctx: RequestContext = {}): Promise<User> {
    const target = await this.prisma.user.findUnique({ where: { id: payload.targetUserId } });
    if (!target) throw new NotFoundException('USER_NOT_FOUND');

    const updated = await this.prisma.user.update({
      where: { id: payload.targetUserId },
      data: { status: UserStatus.disabled },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId: payload.targetUserId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'account_disabled' },
    });

    await this.audit.record({
      actorUserId: payload.actorId,
      action: AuditAction.USER_DISABLED,
      entityType: 'User',
      entityId: payload.targetUserId,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return updated;
  }

  // ---------------------------------------------------------------------
  // Self profile update and read access.
  // ---------------------------------------------------------------------

  async updateOwnProfile(
    actor: AuthenticatedUser,
    dto: UpdateProfileDto,
    ctx: RequestContext = {},
  ): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id: actor.id },
      data: {
        fullName: dto.fullName === undefined ? undefined : this.cipher.encrypt(USER_PII.fullName, dto.fullName),
        phone: dto.phone === undefined ? undefined : this.cipher.encryptNullable(USER_PII.phone, dto.phone),
      },
    });

    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.USER_PROFILE_UPDATED,
      entityType: 'User',
      entityId: user.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { fields: Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined) },
    });

    return user;
  }

  /**
   * Serialises "check username/email is free, then write" across concurrent
   * requests and app instances. Email is encrypted, so no DB unique index can
   * enforce it; a transaction-scoped advisory lock does.
   */
  private withIdentityLock<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(733101)::text');
      return fn(tx);
    });
  }

  /**
   * Email addresses are unique across accounts (a login code must reach
   * exactly one person). Employee count is small, so decrypting in memory is
   * acceptable and avoids another blind index key dependency.
   */
  async isEmailTaken(email: string, exceptUserId?: string): Promise<boolean> {
    const wanted = normalizeEmail(email);
    const users = await this.prisma.user.findMany({
      where: { email: { not: null }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
      select: { id: true, email: true },
    });
    return users.some((u) => {
      const value = this.cipher.decryptNullable(USER_PII.email, u.email);
      return value !== null && normalizeEmail(value) === wanted;
    });
  }

  // ---------------------------------------------------------------------
  // Email change: code to the CURRENT address (step-up on the route), then a
  // code to the NEW address proves it really receives mail.
  // ---------------------------------------------------------------------

  async startEmailChange(actor: AuthenticatedUser, newEmail: string, ctx: RequestContext = {}): Promise<IssuedEmailCode> {
    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    const normalized = normalizeEmail(newEmail);
    const current = this.cipher.decryptNullable(USER_PII.email, user.email);
    if (current && normalizeEmail(current) === normalized) throw new ConflictException('EMAIL_UNCHANGED');
    if (await this.isEmailTaken(normalized, user.id)) throw new ConflictException('EMAIL_TAKEN');
    return this.requireEmailCodes().issue({ user, purpose: EmailCodePurpose.email_change, newEmail: normalized, ctx });
  }

  async confirmEmailChange(
    actor: AuthenticatedUser,
    challengeId: string,
    code: string,
    ctx: RequestContext = {},
  ): Promise<User> {
    const record = await this.requireEmailCodes().consume({
      challengeId,
      code,
      purpose: EmailCodePurpose.email_change,
      userId: actor.id,
      ctx,
    });
    if (!record.newEmailEnc) throw new UnauthorizedException('EMAIL_CODE_INVALID');
    const newEmail = this.cipher.decrypt(NEW_EMAIL_CONTEXT, record.newEmailEnc);
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    const user = await this.withIdentityLock(async (tx) => {
      if (await this.isEmailTaken(newEmail, actor.id)) throw new ConflictException('EMAIL_TAKEN');
      return tx.user.update({
        where: { id: actor.id },
        data: { email: this.cipher.encrypt(USER_PII.email, newEmail), emailVerifiedAt: new Date() },
      });
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.USER_EMAIL_CHANGED,
      entityType: 'User',
      entityId: actor.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    const oldEmail = this.cipher.decryptNullable(USER_PII.email, before.email);
    if (oldEmail && this.email) {
      await this.email
        .send({
          to: [oldEmail],
          subject: 'Email вашего аккаунта CRM изменён',
          text:
            'Email вашего аккаунта CRM «Улуу Жибек Жолу» был изменён. Коды входа теперь приходят на новый адрес.\n\n' +
            'Если это сделали не вы — срочно сообщите Директору.',
        })
        .catch((err: Error) => this.logger.warn(`Email-change notice not delivered: ${err.message}`));
    }
    return user;
  }

  /** Requires the current password (and a step-up code on the route). Ends every session. */
  async changePassword(
    actor: AuthenticatedUser,
    currentPassword: string,
    newPassword: string,
    ctx: RequestContext = {},
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    if (!(await this.passwordService.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException('AUTH_INVALID_CREDENTIALS');
    }
    const passwordHash = await this.passwordService.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: actor.id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: actor.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' },
      }),
    ]);
    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.USER_PASSWORD_CHANGED,
      entityType: 'User',
      entityId: actor.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  private requireEmailCodes(): EmailCodesService {
    if (!this.emailCodes) throw new Error('EmailCodesService is not wired');
    return this.emailCodes;
  }

  async setAvatar(userId: string, fileId: string | null): Promise<{ previousFileId: string | null; user: User }> {
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarFileId: fileId } });
    return { previousFileId: before.avatarFileId, user };
  }

  /**
   * Profile visibility: self, the account's creator, the user's team lead, or
   * a director. Everyone else gets 403 (IDOR guard).
   */
  async getVisibleUserOrThrow(actor: AuthenticatedUser, targetId: string): Promise<User> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('USER_NOT_FOUND');

    const isSelf = target.id === actor.id;
    const isCreator = target.createdById === actor.id;
    const isTeamLead = target.teamLeadId === actor.id;
    const isDirector = actor.role === UserRole.director;

    if (!isSelf && !isCreator && !isTeamLead && !isDirector) {
      throw new ForbiddenException('AUTH_FORBIDDEN');
    }
    return target;
  }

  /** Director: every account. Head of sales: their team. Others: forbidden. */
  async listVisibleUsers(actor: AuthenticatedUser): Promise<User[]> {
    if (actor.role === UserRole.director) {
      return this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    }
    if (actor.role === UserRole.head_of_sales) {
      return this.prisma.user.findMany({ where: { teamLeadId: actor.id }, orderBy: { createdAt: 'asc' } });
    }
    throw new ForbiddenException('AUTH_FORBIDDEN');
  }
}
