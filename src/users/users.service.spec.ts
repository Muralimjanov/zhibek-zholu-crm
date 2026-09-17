import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { UsersService } from './users.service';
import { EncryptionService } from '../crypto/encryption.service';
import { FieldCipher } from '../crypto/field-cipher.service';
import { AppConfigService } from '../config/app-config.service';

// One fixed key for the whole file so values encrypted in setup decrypt later.
const fixedKey = randomBytes(32).toString('base64');
const fixedCipher = new FieldCipher(
  new EncryptionService({ encryptionCurrentVersion: 'v1', encryptionKeyFor: () => fixedKey } as unknown as AppConfigService),
);


function buildUser(overrides: Partial<any> = {}) {
  return {
    id: 'u-1',
    username: 'someone',
    passwordHash: 'hash',
    fullName: fixedCipher.encrypt('User.fullName', 'Someone'),
    phone: null,
    email: null,
    avatarFileId: null,
    teamLeadId: null,
    role: UserRole.sales_manager,
    status: UserStatus.active,
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildDeps() {
  const usersById = new Map<string, any>();
  const usersByUsername = new Map<string, any>();

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return usersById.get(where.id) ?? null;
        if (where.username) return usersByUsername.get(where.username) ?? null;
        return null;
      }),
      findMany: jest.fn(async ({ where }: any = {}) => {
        let result = [...usersById.values()];
        if (where?.role) result = result.filter((u) => u.role === where.role);
        if (where?.status) result = result.filter((u) => u.status === where.status);
        if (where?.email?.not === null) result = result.filter((u) => u.email !== null);
        return result;
      }),
      create: jest.fn(async ({ data }: any) => {
        const user = buildUser({ id: `new-${usersById.size + 1}`, ...data });
        usersById.set(user.id, user);
        usersByUsername.set(user.username, user);
        return user;
      }),
      update: jest.fn(async ({ where: { id }, data }: any) => {
        const user = usersById.get(id);
        Object.assign(user, data);
        return user;
      }),
    },
    refreshToken: {
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
  } as any;

  const passwordService = { hash: jest.fn(async () => 'hashed-password') } as any;
  const audit = { record: jest.fn(async () => undefined) } as any;

  const service = new UsersService(prisma, passwordService, audit, fixedCipher);
  return { service, prisma, passwordService, audit, usersById, usersByUsername };
}

describe('UsersService.prepareCreateUser / executeCreateUser', () => {
  it('director can prepare+execute creating a head_of_sales', async () => {
    const { service, usersById } = buildDeps();
    const director = { id: 'dir-1', username: 'director1', role: UserRole.director };
    usersById.set(director.id, buildUser({ id: director.id, username: director.username, role: director.role }));
    const payload = await service.prepareCreateUser(director, {
      username: 'headofsales1',
      password: 'a-strong-password-1',
      fullName: 'Head Of Sales',
      role: UserRole.head_of_sales,
    });
    expect(payload.role).toBe(UserRole.head_of_sales);

    const created = await service.executeCreateUser(payload);
    expect(created.role).toBe(UserRole.head_of_sales);
    expect(created.createdById).toBe('dir-1');
  });

  it('head_of_sales can prepare+execute creating a sales_manager', async () => {
    const { service, usersById } = buildDeps();
    const hos = { id: 'hos-1', username: 'hos1', role: UserRole.head_of_sales };
    usersById.set(hos.id, buildUser({ id: hos.id, username: hos.username, role: hos.role }));
    const payload = await service.prepareCreateUser(hos, {
      username: 'manager1',
      password: 'a-strong-password-1',
      fullName: 'Manager One',
      role: UserRole.sales_manager,
    });
    const created = await service.executeCreateUser(payload);
    expect(created.role).toBe(UserRole.sales_manager);
  });

  it('rejects head_of_sales attempting to prepare a director (privilege escalation) - fails at PREPARE, before any pending action would exist', async () => {
    const { service, audit } = buildDeps();
    const hos = { id: 'hos-1', username: 'hos1', role: UserRole.head_of_sales };
    await expect(
      service.prepareCreateUser(hos, {
        username: 'wannabe-director',
        password: 'a-strong-password-1',
        fullName: 'X',
        role: UserRole.director,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_CREATION_FORBIDDEN' }),
    );
  });

  it('rejects investor attempting to prepare any creation (privilege escalation)', async () => {
    const { service } = buildDeps();
    const investor = { id: 'inv-1', username: 'inv1', role: UserRole.investor };
    await expect(
      service.prepareCreateUser(investor, {
        username: 'nope',
        password: 'a-strong-password-1',
        fullName: 'X',
        role: UserRole.sales_manager,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects sales_manager attempting to prepare creating an accountant (privilege escalation)', async () => {
    const { service } = buildDeps();
    const manager = { id: 'sm-1', username: 'sm1', role: UserRole.sales_manager };
    await expect(
      service.prepareCreateUser(manager, {
        username: 'nope2',
        password: 'a-strong-password-1',
        fullName: 'X',
        role: UserRole.accountant,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('prepare rejects duplicate usernames', async () => {
    const { service, usersById } = buildDeps();
    const director = { id: 'dir-1', username: 'director1', role: UserRole.director };
    usersById.set(director.id, buildUser({ id: director.id, username: director.username, role: director.role }));
    const dto = {
      username: 'accountant1',
      password: 'a-strong-password-1',
      fullName: 'Accountant',
      role: UserRole.accountant,
    };
    const payload = await service.prepareCreateUser(director, dto);
    await service.executeCreateUser(payload);
    await expect(service.prepareCreateUser(director, dto)).rejects.toThrow(ConflictException);
  });

  it('execute re-checks uniqueness at execution time (race/staleness safety)', async () => {
    const { service, usersById, usersByUsername } = buildDeps();
    const director = { id: 'dir-1', username: 'director1', role: UserRole.director };
    usersById.set(director.id, buildUser({ id: director.id, username: director.username, role: director.role }));
    const payload = await service.prepareCreateUser(director, {
      username: 'racer1',
      password: 'a-strong-password-1',
      fullName: 'Racer',
      role: UserRole.accountant,
    });
    // Simulate someone else taking the username while this action was
    // still pending confirmation.
    const somebodyElse = buildUser({ id: 'other', username: 'racer1' });
    usersById.set(somebodyElse.id, somebodyElse);
    usersByUsername.set('racer1', somebodyElse);

    await expect(service.executeCreateUser(payload)).rejects.toThrow(ConflictException);
  });

  it('never persists the plaintext password - only the hash from PasswordService', async () => {
    const { service, prisma, passwordService, usersById } = buildDeps();
    const director = { id: 'dir-1', username: 'director1', role: UserRole.director };
    usersById.set(director.id, buildUser({ id: director.id, username: director.username, role: director.role }));
    const payload = await service.prepareCreateUser(director, {
      username: 'investor1',
      password: 'super-secret-plain-password',
      fullName: 'Investor',
      role: UserRole.investor,
    });
    expect(passwordService.hash).toHaveBeenCalledWith('super-secret-plain-password');
    expect((payload as any).password).toBeUndefined();
    expect(payload.passwordHash).toBe('hashed-password');

    await service.executeCreateUser(payload);
    const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.passwordHash).toBe('hashed-password');
    expect(createCall.data).not.toHaveProperty('password');
  });

  it('encrypts PII already at PREPARE time, so the PendingAction payload holds no plaintext', async () => {
    const { service, prisma, usersById } = buildDeps();
    const director = { id: 'dir-1', username: 'director1', role: UserRole.director };
    usersById.set(director.id, buildUser({ id: director.id, username: director.username, role: director.role }));
    const payload = await service.prepareCreateUser(director, {
      username: 'acc9',
      password: 'a-strong-password-1',
      fullName: 'Айгуль Секретова',
      phone: '+996555123456',
      email: 'aigul@example.com',
      role: UserRole.accountant,
    });
    const serialized = JSON.stringify(payload);
    for (const plain of ['Айгуль', '555123456', 'aigul@example.com']) expect(serialized).not.toContain(plain);

    const created = await service.executeCreateUser(payload);
    const response = service.toResponse(created as any);
    expect(response).toMatchObject({ fullName: 'Айгуль Секретова', phone: '+996555123456', email: 'aigul@example.com' });
    expect(JSON.stringify((prisma.user.create as jest.Mock).mock.calls[0][0].data)).not.toContain('Айгуль');
  });

  it('a sales manager created by a head of sales joins that team', async () => {
    const { service, usersById } = buildDeps();
    const hos = { id: 'hos-1', username: 'hos1', role: UserRole.head_of_sales };
    usersById.set(hos.id, buildUser({ id: hos.id, username: hos.username, role: hos.role }));
    const payload = await service.prepareCreateUser(hos, {
      username: 'teammate',
      password: 'a-strong-password-1',
      fullName: 'Team Mate',
      role: UserRole.sales_manager,
    });
    const created = await service.executeCreateUser(payload);
    expect(created.teamLeadId).toBe('hos-1');
  });
});

describe('UsersService.updateOwnProfile', () => {
  it('updates allowed fields and cannot touch role (DTO has no role field)', async () => {
    const { service, prisma } = buildDeps();
    prisma.user.update.mockImplementationOnce(async ({ data }: any) => ({
      ...buildUser(),
      ...data,
    }));

    const actor = { id: 'u-1', username: 'someone', role: UserRole.sales_manager };
    const updated = await service.updateOwnProfile(actor, { fullName: 'New Name' } as any);
    // Stored encrypted, returned decrypted only through toResponse().
    expect(updated.fullName).not.toContain('New Name');
    expect(service.toResponse(updated as any).fullName).toBe('New Name');
    const updateCall = (prisma.user.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('role');
  });
});

describe('UsersService.prepareDisableUser / executeDisableUser', () => {
  it('director can prepare+execute disabling anyone, refresh sessions get revoked', async () => {
    const { service, prisma, usersById } = buildDeps();
    const target = buildUser({ id: 'target-1' });
    usersById.set(target.id, target);

    const director = { id: 'dir-1', username: 'director1', role: UserRole.director };
    const payload = await service.prepareDisableUser(director, 'target-1');
    const disabled = await service.executeDisableUser(payload);

    expect(disabled.status).toBe(UserStatus.disabled);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'target-1', revokedAt: null } }),
    );
  });

  it('a peer with no creation relationship cannot even prepare a disable', async () => {
    const { service, usersById } = buildDeps();
    const target = buildUser({ id: 'target-1', createdById: 'someone-else' });
    usersById.set(target.id, target);

    const unrelatedManager = { id: 'mgr-2', username: 'mgr2', role: UserRole.sales_manager };
    await expect(service.prepareDisableUser(unrelatedManager, 'target-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('UsersService.getVisibleUserOrThrow (IDOR guard)', () => {
  it('a user can view their own record', async () => {
    const { service, usersById } = buildDeps();
    const self = buildUser({ id: 'self-1' });
    usersById.set(self.id, self);
    const actor = { id: 'self-1', username: 'someone', role: UserRole.sales_manager };
    const result = await service.getVisibleUserOrThrow(actor, 'self-1');
    expect(result.id).toBe('self-1');
  });

  it('director can view any user', async () => {
    const { service, usersById } = buildDeps();
    const other = buildUser({ id: 'other-1' });
    usersById.set(other.id, other);
    const director = { id: 'dir-1', username: 'director1', role: UserRole.director };
    const result = await service.getVisibleUserOrThrow(director, 'other-1');
    expect(result.id).toBe('other-1');
  });

  it('a manager cannot view an unrelated user by guessing their id (IDOR)', async () => {
    const { service, usersById } = buildDeps();
    const other = buildUser({ id: 'other-1', createdById: 'unrelated-hos' });
    usersById.set(other.id, other);
    const manager = { id: 'mgr-1', username: 'mgr1', role: UserRole.sales_manager };
    await expect(service.getVisibleUserOrThrow(manager, 'other-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns 404-style error for a non-existent id rather than leaking existence via 403', async () => {
    const { service } = buildDeps();
    const actor = { id: 'a-1', username: 'a', role: UserRole.director };
    await expect(service.getVisibleUserOrThrow(actor, 'does-not-exist')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('UsersService.listDirectorEmails', () => {
  it('returns only active directors with an email set', async () => {
    const { service, usersById } = buildDeps();
    const enc = (e: string) => fixedCipher.encrypt('User.email', e);
    usersById.set('d1', buildUser({ id: 'd1', role: UserRole.director, email: enc('d1@x.com') }));
    usersById.set('d2', buildUser({ id: 'd2', role: UserRole.director, email: null }));
    usersById.set(
      'd3',
      buildUser({ id: 'd3', role: UserRole.director, email: enc('d3@x.com'), status: UserStatus.disabled }),
    );
    usersById.set('m1', buildUser({ id: 'm1', role: UserRole.sales_manager, email: enc('m1@x.com') }));

    const emails = await service.listDirectorEmails();
    expect(emails).toEqual(['d1@x.com']);
  });
});
