import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditResult, EmailCodePurpose, User, UserStatus } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { PasswordService } from './password.service';
import { RefreshTokenService, RotateContext } from './refresh-token.service';
import { AppConfigService } from '../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { EmailCodesService, IssuedEmailCode } from '../email-codes/email-codes.service';
import { PrismaService } from '../prisma/prisma.service';

export interface LoginResult {
  accessToken: string;
  accessTokenExpiresInSeconds: number;
  refreshToken: string;
  user: User;
}

/**
 * Login failures for "unknown username" and "wrong password" are
 * intentionally indistinguishable to the caller (AUTH_SPEC.md §16) - both
 * result in the same generic error after performing a hash comparison in
 * both branches, which also mitigates username-enumeration-via-timing.
 */
const GENERIC_LOGIN_ERROR = 'AUTH_INVALID_CREDENTIALS';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly emailCodes?: EmailCodesService,
    private readonly prisma?: PrismaService,
  ) {}

  private async dummyHashCompare(): Promise<void> {
    // Constant-work placeholder so "user not found" takes roughly the same
    // time as "user found, wrong password" (timing-based enumeration
    // mitigation - best-effort, not a formal guarantee).
    await this.passwordService.verify(
      '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'placeholder',
    );
  }

  /**
   * Step 1 of login: checks the password, then emails a one-time code to the
   * account's address. No tokens are issued until the code is verified.
   */
  async startLogin(username: string, password: string, ctx: RotateContext = {}): Promise<IssuedEmailCode> {
    const user = await this.verifyCredentials(username, password, ctx);
    if (!user.email) {
      await this.audit.record({
        actorUserId: user.id,
        action: AuditAction.LOGIN_FAILURE,
        result: AuditResult.failure,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { reason: 'email_not_configured' },
      });
      // Only reachable with the correct password: the account needs an email
      // set by a Director before it can sign in.
      throw new ForbiddenException('AUTH_EMAIL_NOT_CONFIGURED');
    }
    return this.requireEmailCodes().issue({ user, purpose: EmailCodePurpose.login, ctx });
  }

  /** Step 2 of login: a correct, unused, unexpired code issues the session. */
  async verifyLoginCode(challengeId: string, code: string, ctx: RotateContext = {}): Promise<LoginResult> {
    const record = await this.requireEmailCodes().consume({ challengeId, code, purpose: EmailCodePurpose.login, ctx });
    const user = await this.usersService.findById(record.userId);
    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
    // Receiving the code proves the address works.
    const verified =
      user.emailVerifiedAt || !this.prisma
        ? user
        : await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    return this.completeLogin(verified, ctx);
  }

  /**
   * Password-only login. Used by the controller ONLY when
   * TEST_BYPASS_LOGIN_EMAIL_CODE is honoured (NODE_ENV=test).
   */
  async login(username: string, password: string, ctx: RotateContext = {}): Promise<LoginResult> {
    const user = await this.verifyCredentials(username, password, ctx);
    return this.completeLogin(user, ctx);
  }

  private async verifyCredentials(username: string, password: string, ctx: RotateContext): Promise<User> {
    const user = await this.usersService.findByUsername(username);

    if (!user) {
      await this.dummyHashCompare();
      await this.audit.record({
        action: AuditAction.LOGIN_FAILURE,
        result: AuditResult.failure,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { username },
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const passwordValid = await this.passwordService.verify(user.passwordHash, password);

    if (!passwordValid || user.status !== UserStatus.active) {
      await this.audit.record({
        actorUserId: user.id,
        action: AuditAction.LOGIN_FAILURE,
        result: AuditResult.failure,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      // Same error for "wrong password" and "disabled account" - do not
      // reveal account status to an unauthenticated caller (AUTH_SPEC.md §16).
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
    return user;
  }

  private async completeLogin(user: User, ctx: RotateContext): Promise<LoginResult> {
    const accessToken = this.signAccessToken(user);
    const refresh = await this.refreshTokenService.issue(user.id, ctx);

    await this.audit.record({
      actorUserId: user.id,
      action: AuditAction.LOGIN_SUCCESS,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      accessToken,
      accessTokenExpiresInSeconds: this.config.jwtAccessTtlSeconds,
      refreshToken: refresh.raw,
      user,
    };
  }

  private requireEmailCodes(): EmailCodesService {
    if (!this.emailCodes) throw new Error('EmailCodesService is not available');
    return this.emailCodes;
  }

  async refresh(rawRefreshToken: string, ctx: RotateContext = {}): Promise<LoginResult> {
    const rotated = await this.refreshTokenService.rotate(rawRefreshToken, ctx);
    const user = await this.usersService.findById(rotated.record.userId);

    if (!user || user.status !== UserStatus.active) {
      // Account was disabled between token issuance and this refresh call.
      await this.refreshTokenService.revokeFamily(rotated.record.familyId, 'account_disabled');
      throw new UnauthorizedException('AUTH_ACCOUNT_DISABLED');
    }

    const accessToken = this.signAccessToken(user);

    return {
      accessToken,
      accessTokenExpiresInSeconds: this.config.jwtAccessTtlSeconds,
      refreshToken: rotated.raw,
      user,
    };
  }

  async logout(rawRefreshToken: string | undefined, actorUserId: string | undefined, ctx: RotateContext = {}): Promise<void> {
    let sessionOwnerId: string | undefined;
    if (rawRefreshToken) {
      const revoked = await this.refreshTokenService.revokeByRawToken(rawRefreshToken);
      sessionOwnerId = revoked?.userId;
    }
    await this.audit.record({
      // /auth/logout is cookie-authenticated (no access token), so the actor
      // is the owner of the refresh session being revoked.
      actorUserId: actorUserId ?? sessionOwnerId,
      action: AuditAction.LOGOUT,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  private signAccessToken(user: User): string {
    // Minimal claims only - no PII, no financial data (AUTH_SPEC.md §6).
    return this.jwtService.sign(
      { sub: user.id, role: user.role, username: user.username },
      { secret: this.config.jwtAccessSecret, expiresIn: this.config.jwtAccessTtlSeconds },
    );
  }
}
