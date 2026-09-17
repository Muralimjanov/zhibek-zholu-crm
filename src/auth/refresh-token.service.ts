import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, createHash, randomUUID } from 'crypto';
import { AuditResult, Prisma, RefreshToken } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';

export interface IssuedRefreshToken {
  raw: string;
  record: RefreshToken;
}

export interface RotateContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Refresh tokens are opaque, high-entropy random secrets. Only their SHA-256
 * hash is ever persisted (AUTH_SPEC.md §7) - unlike passwords, they need
 * fast exact-match lookup on every /auth/refresh call, so a slow KDF
 * (Argon2) is neither necessary nor appropriate here; the secret's entropy
 * (256 bits) is what protects it, not hashing cost.
 *
 * Rotation + family-based reuse detection: every refresh issues a new
 * token and immediately revokes the old one. If a revoked token is ever
 * presented again, the entire family is treated as compromised and revoked.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private generateRawToken(): string {
    return randomBytes(48).toString('base64url');
  }

  async issue(userId: string, ctx: RotateContext = {}, familyId?: string): Promise<IssuedRefreshToken> {
    const raw = this.generateRawToken();
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000);

    const record = await this.prisma.refreshToken.create({
      data: {
        familyId: familyId ?? randomUUID(),
        userId,
        tokenHash: this.hashToken(raw),
        expiresAt,
        userAgent: ctx.userAgent,
        ipAddress: ctx.ip,
      },
    });

    return { raw, record };
  }

  /**
   * Validates + rotates a presented refresh token.
   * Throws UnauthorizedException('AUTH_REFRESH_INVALID') for unknown,
   * expired, or already-revoked-without-reuse-signal tokens, and for
   * detected reuse (message is identical to avoid signalling to a client
   * which case occurred; the security event is distinguished in the audit
   * log, not in the HTTP response).
   */
  async rotate(rawToken: string, ctx: RotateContext = {}): Promise<IssuedRefreshToken> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) {
      await this.audit.record({
        action: AuditAction.REFRESH_FAILURE,
        result: AuditResult.failure,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException('AUTH_REFRESH_INVALID');
    }

    if (existing.revokedAt) {
      // Reuse of an already-rotated (or already-revoked) token: treat as
      // potential theft and burn the whole family.
      return this.handleReuse(existing, ctx);
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      await this.audit.record({
        actorUserId: existing.userId,
        action: AuditAction.REFRESH_FAILURE,
        entityType: 'RefreshToken',
        entityId: existing.id,
        result: AuditResult.failure,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException('AUTH_REFRESH_INVALID');
    }

    const next = await this.issue(existing.userId, ctx, existing.familyId);

    // Conditional revoke (`revokedAt: null` in the unique where): of several
    // concurrent requests presenting the same token, exactly one can flip
    // revokedAt from NULL. The others lost the race, i.e. the same token was
    // used twice - handled exactly like reuse.
    // `next` is created BEFORE this claim so a losing request's family
    // revocation always covers the winner's freshly issued token as well.
    try {
      await this.prisma.refreshToken.update({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'rotated', replacedByTokenId: next.record.id },
      });
    } catch (err) {
      // P2025: no row matched `revokedAt: null` - another request rotated it first.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return this.handleReuse(existing, ctx);
      }
      throw err;
    }

    await this.audit.record({
      actorUserId: existing.userId,
      action: AuditAction.REFRESH_SUCCESS,
      entityType: 'RefreshToken',
      entityId: next.record.id,
      result: AuditResult.success,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { familyId: existing.familyId },
    });

    return next;
  }

  private async handleReuse(existing: RefreshToken, ctx: RotateContext): Promise<never> {
    await this.revokeFamily(existing.familyId, 'reuse_detected');
    await this.audit.record({
      actorUserId: existing.userId,
      action: AuditAction.REFRESH_REUSE_DETECTED,
      entityType: 'RefreshToken',
      entityId: existing.id,
      result: AuditResult.failure,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { familyId: existing.familyId },
    });
    throw new UnauthorizedException('AUTH_REFRESH_INVALID');
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeByRawToken(rawToken: string): Promise<RefreshToken | null> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) return null;
    await this.revokeFamily(existing.familyId, 'logout');
    return existing;
  }

  async revokeAllForUser(userId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}
