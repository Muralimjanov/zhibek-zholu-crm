import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';

function buildUser(overrides: Partial<any> = {}) {
  return {
    id: 'user-1',
    username: 'ivan',
    passwordHash: 'irrelevant-in-mock',
    fullName: 'Ivan Ivanov',
    phone: null,
    email: null,
    avatarUrl: null,
    role: 'sales_manager',
    status: UserStatus.active,
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  const config = {
    jwtAccessSecret: 'test-secret',
    jwtAccessTtlSeconds: 900,
  } as any;

  function build(userLookup: (username: string) => Promise<any | null>, passwordValid = true) {
    const usersService = { findByUsername: jest.fn(userLookup), findById: jest.fn() } as any;
    const passwordService = { verify: jest.fn(async () => passwordValid) } as any;
    const refreshTokenService = {
      issue: jest.fn(async () => ({ raw: 'raw-refresh-token', record: { familyId: 'fam-1' } })),
      rotate: jest.fn(),
      revokeFamily: jest.fn(),
      revokeByRawToken: jest.fn(),
    } as any;
    const jwtService = new JwtService();
    const audit = { record: jest.fn(async () => undefined) } as any;

    const service = new AuthService(
      usersService,
      passwordService,
      refreshTokenService,
      jwtService,
      config,
      audit,
    );
    return { service, usersService, passwordService, refreshTokenService, audit };
  }

  it('logs in successfully with correct credentials', async () => {
    const user = buildUser();
    const { service } = build(async () => user, true);

    const result = await service.login('ivan', 'correct-password');
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBe('raw-refresh-token');
    expect(result.user.id).toBe('user-1');
  });

  it('rejects login for an unknown username with a generic error', async () => {
    const { service } = build(async () => null);
    await expect(service.login('ghost', 'whatever')).rejects.toThrow(UnauthorizedException);
    await expect(service.login('ghost', 'whatever')).rejects.toThrow('AUTH_INVALID_CREDENTIALS');
  });

  it('rejects login for a wrong password with the SAME generic error as unknown username', async () => {
    const user = buildUser();
    const { service } = build(async () => user, false);
    await expect(service.login('ivan', 'wrong')).rejects.toThrow('AUTH_INVALID_CREDENTIALS');
  });

  it('rejects login for a disabled account without revealing that it is disabled', async () => {
    const user = buildUser({ status: UserStatus.disabled });
    const { service } = build(async () => user, true);
    await expect(service.login('ivan', 'correct-password')).rejects.toThrow(
      'AUTH_INVALID_CREDENTIALS',
    );
  });

  it('issues an access token containing only minimal claims (sub, role, username)', async () => {
    const user = buildUser();
    const { service } = build(async () => user, true);
    const result = await service.login('ivan', 'correct-password');

    const decoded = new JwtService().decode(result.accessToken) as Record<string, unknown>;
    expect(Object.keys(decoded).sort()).toEqual(
      ['sub', 'role', 'username', 'iat', 'exp'].sort(),
    );
    expect(decoded).not.toHaveProperty('passwordHash');
    expect(decoded).not.toHaveProperty('phone');
  });

  it('refresh() rejects when the account was disabled after the token was issued', async () => {
    const usersService = {
      findById: jest.fn(async () => buildUser({ status: UserStatus.disabled })),
    } as any;
    const passwordService = { verify: jest.fn() } as any;
    const refreshTokenService = {
      rotate: jest.fn(async () => ({
        raw: 'new-raw',
        record: { userId: 'user-1', familyId: 'fam-1' },
      })),
      revokeFamily: jest.fn(async () => undefined),
    } as any;
    const audit = { record: jest.fn(async () => undefined) } as any;
    const service = new AuthService(
      usersService,
      passwordService,
      refreshTokenService,
      new JwtService(),
      config,
      audit,
    );

    await expect(service.refresh('some-raw-token')).rejects.toThrow('AUTH_ACCOUNT_DISABLED');
    expect(refreshTokenService.revokeFamily).toHaveBeenCalledWith('fam-1', 'account_disabled');
  });

  it('logout revokes the refresh session and records an audit event', async () => {
    const { service, refreshTokenService, audit } = build(async () => null);
    await service.logout('raw-token', 'user-1');
    expect(refreshTokenService.revokeByRawToken).toHaveBeenCalledWith('raw-token');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGOUT' }));
  });
});
