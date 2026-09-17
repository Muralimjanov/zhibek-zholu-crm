import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RefreshTokenService } from './refresh-token.service';

function buildPrismaMock() {
  const store = new Map<string, any>();
  return {
    store,
    refreshToken: {
      create: jest.fn(async ({ data }: any) => {
        const record = {
          id: `id-${store.size + 1}`,
          revokedAt: null,
          revokedReason: null,
          replacedByTokenId: null,
          createdAt: new Date(),
          ...data,
        };
        store.set(record.tokenHash, record);
        return record;
      }),
      findUnique: jest.fn(async ({ where: { tokenHash } }: any) => store.get(tokenHash) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        for (const record of store.values()) {
          if (record.id !== where.id) continue;
          if (where.revokedAt === null && record.revokedAt !== null) {
            throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
              code: 'P2025',
              clientVersion: 'test',
            });
          }
          Object.assign(record, data);
          return record;
        }
        throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
          code: 'P2025',
          clientVersion: 'test',
        });
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const record of store.values()) {
          const familyMatches = record.familyId === where.familyId;
          const notYetRevoked = where.revokedAt === null ? record.revokedAt === null : true;
          if (familyMatches && notYetRevoked) {
            Object.assign(record, data);
            count++;
          }
        }
        return { count };
      }),
    },
  };
}

function fakeConfig(refreshTtlSeconds = 2_592_000) {
  return { refreshTokenTtlSeconds: refreshTtlSeconds } as any;
}

function fakeAudit() {
  return { record: jest.fn(async () => undefined) } as any;
}

describe('RefreshTokenService', () => {
  it('issues a token whose raw value is never stored - only its hash', async () => {
    const prisma = buildPrismaMock();
    const service = new RefreshTokenService(prisma as any, fakeConfig(), fakeAudit());

    const issued = await service.issue('user-1');
    expect(issued.raw).toBeTruthy();
    for (const record of prisma.store.values()) {
      expect(record.tokenHash).not.toEqual(issued.raw);
    }
  });

  it('rotates a valid token: old token becomes unusable, new token works', async () => {
    const prisma = buildPrismaMock();
    const service = new RefreshTokenService(prisma as any, fakeConfig(), fakeAudit());

    const first = await service.issue('user-1');
    const second = await service.rotate(first.raw);

    expect(second.raw).not.toEqual(first.raw);
    // Old token can no longer be used again.
    await expect(service.rotate(first.raw)).rejects.toThrow(UnauthorizedException);
  });

  it('detects reuse of an already-rotated token and revokes the whole family', async () => {
    const prisma = buildPrismaMock();
    const audit = fakeAudit();
    const service = new RefreshTokenService(prisma as any, fakeConfig(), audit);

    const first = await service.issue('user-1');
    const second = await service.rotate(first.raw);

    // Attacker replays the OLD (already-rotated) token.
    await expect(service.rotate(first.raw)).rejects.toThrow(UnauthorizedException);

    // The legitimate NEW token (from the same family) must also now be dead,
    // because reuse revokes the entire family, not just the replayed token.
    await expect(service.rotate(second.raw)).rejects.toThrow(UnauthorizedException);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REFRESH_REUSE_DETECTED' }),
    );
  });

  it('a request that loses the rotation race is treated as reuse and revokes the family, incl. the winner token', async () => {
    const prisma = buildPrismaMock();
    const audit = fakeAudit();
    const service = new RefreshTokenService(prisma as any, fakeConfig(), audit);
    const first = await service.issue('user-1');

    // Both requests read the token while it was still unrevoked.
    const snapshot = { ...[...prisma.store.values()][0] };
    prisma.refreshToken.findUnique.mockResolvedValue(snapshot);

    const results = await Promise.allSettled([service.rotate(first.raw), service.rotate(first.raw)]);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    for (const record of prisma.store.values()) {
      expect(record.revokedAt).not.toBeNull();
    }
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'REFRESH_REUSE_DETECTED' }));
  });

  it('rejects an unknown/never-issued token', async () => {
    const prisma = buildPrismaMock();
    const service = new RefreshTokenService(prisma as any, fakeConfig(), fakeAudit());
    await expect(service.rotate('totally-made-up-token')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const prisma = buildPrismaMock();
    const service = new RefreshTokenService(prisma as any, fakeConfig(-10), fakeAudit());
    const issued = await service.issue('user-1');
    await expect(service.rotate(issued.raw)).rejects.toThrow(UnauthorizedException);
  });

  it('logout (revokeByRawToken) invalidates the whole session family', async () => {
    const prisma = buildPrismaMock();
    const service = new RefreshTokenService(prisma as any, fakeConfig(), fakeAudit());
    const issued = await service.issue('user-1');

    await service.revokeByRawToken(issued.raw);
    await expect(service.rotate(issued.raw)).rejects.toThrow(UnauthorizedException);
  });
});
