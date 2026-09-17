import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PendingActionStatus, PendingActionType, UserRole, UserStatus } from '@prisma/client';
import { ConfirmationsService } from './confirmations.service';

function buildUser(overrides: Partial<any> = {}) {
  return {
    id: 'u-1',
    username: 'someone',
    passwordHash: 'hash',
    fullName: 'Someone',
    phone: null,
    email: null,
    avatarUrl: null,
    role: UserRole.sales_manager,
    status: UserStatus.active,
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildHarness() {
  const pendingActions = new Map<string, any>();
  let counter = 0;

  const prisma = {
    pendingAction: {
      create: jest.fn(async ({ data }: any) => {
        const record = {
          id: `pa-${++counter}`,
          status: PendingActionStatus.pending,
          attempts: 0,
          confirmedAt: null,
          confirmedByUserId: null,
          rejectedAt: null,
          rejectedByUserId: null,
          createdAt: new Date(),
          ...data,
        };
        pendingActions.set(record.id, record);
        return record;
      }),
      findUnique: jest.fn(async ({ where: { id } }: any) => pendingActions.get(id) ?? null),
      findMany: jest.fn(async () =>
        [...pendingActions.values()].filter((r) => r.status === PendingActionStatus.pending),
      ),
      update: jest.fn(async ({ where: { id }, data }: any) => {
        const record = pendingActions.get(id);
        Object.assign(record, data);
        return record;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const record = pendingActions.get(where.id);
        if (!record || record.status !== where.status) return { count: 0 };
        Object.assign(record, data);
        return { count: 1 };
      }),
    },
  } as any;

  const config = {
    confirmationCodeTtlSeconds: 600,
    confirmationCodeMaxAttempts: 3,
  } as any;

  const audit = { record: jest.fn(async () => undefined) } as any;
  const email = { send: jest.fn(async () => undefined) } as any;

  const usersService = {
    prepareCreateUser: jest.fn(),
    executeCreateUser: jest.fn(async () => buildUser({ id: 'created-1' })),
    prepareDisableUser: jest.fn(),
    executeDisableUser: jest.fn(async () => buildUser({ id: 'target-1', status: UserStatus.disabled })),
    findById: jest.fn(async () => buildUser({ id: 'target-1', username: 'targetuser' })),
    listDirectorEmails: jest.fn(async () => ['director@example.com']),
  } as any;

  const service = new ConfirmationsService(prisma, config, audit, email, usersService);
  return { service, prisma, pendingActions, audit, email, usersService };
}

const director: any = { id: 'dir-1', username: 'director1', role: UserRole.director };

describe('ConfirmationsService.initiateCreateUser', () => {
  it('propagates a PREPARE-time rejection immediately - no PendingAction, no email', async () => {
    const { service, prisma, email, usersService } = buildHarness();
    usersService.prepareCreateUser.mockRejectedValue(new ForbiddenException('USER_ROLE_CREATION_FORBIDDEN'));

    await expect(
      service.initiateCreateUser(director, {} as any),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.pendingAction.create).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('creates a PendingAction and emails all Director recipients on success', async () => {
    const { service, prisma, email, usersService } = buildHarness();
    usersService.prepareCreateUser.mockResolvedValue({
      username: 'newuser',
      passwordHash: 'hashed',
      fullName: 'New User',
      role: UserRole.accountant,
      initiatorId: director.id,
    });

    const result = await service.initiateCreateUser(director, {} as any);

    expect(prisma.pendingAction.create).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(PendingActionStatus.pending);
    expect(result.emailDelivery).toBe('sent');
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['director@example.com'] }),
    );
    // The email body must never be inspectable for the raw code by test
    // assertion alone, but we CAN assert the code is not the literal
    // string "undefined" and is embedded exactly once, sanity-checking
    // the email actually contains SOMETHING resembling a code.
    const [[arg]] = email.send.mock.calls;
    expect(arg.text).toMatch(/Код подтверждения: [23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}/);
  });

  it('reports no_recipients and still creates the PendingAction if no Director has an email', async () => {
    const { service, prisma, usersService } = buildHarness();
    usersService.listDirectorEmails.mockResolvedValue([]);
    usersService.prepareCreateUser.mockResolvedValue({
      username: 'newuser2',
      passwordHash: 'hashed',
      fullName: 'New User 2',
      role: UserRole.accountant,
      initiatorId: director.id,
    });

    const result = await service.initiateCreateUser(director, {} as any);
    expect(result.emailDelivery).toBe('no_recipients');
    expect(prisma.pendingAction.create).toHaveBeenCalledTimes(1);
  });

  it('reports failed delivery (but keeps the PendingAction) if SMTP throws', async () => {
    const { service, prisma, email, usersService, audit } = buildHarness();
    usersService.prepareCreateUser.mockResolvedValue({
      username: 'newuser3',
      passwordHash: 'hashed',
      fullName: 'New User 3',
      role: UserRole.accountant,
      initiatorId: director.id,
    });
    email.send.mockRejectedValue(new Error('SMTP down'));

    const result = await service.initiateCreateUser(director, {} as any);
    expect(result.emailDelivery).toBe('failed');
    expect(prisma.pendingAction.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PENDING_ACTION_EMAIL_FAILED' }),
    );
  });

  it('never puts the plaintext code into the audit trail', async () => {
    const { service, audit, usersService } = buildHarness();
    usersService.prepareCreateUser.mockResolvedValue({
      username: 'audituser',
      passwordHash: 'hashed',
      fullName: 'Audit User',
      role: UserRole.accountant,
      initiatorId: director.id,
    });
    await service.initiateCreateUser(director, {} as any);

    for (const call of audit.record.mock.calls) {
      const [arg] = call;
      expect(JSON.stringify(arg)).not.toMatch(/"code"/);
    }
  });
});

describe('ConfirmationsService.confirm', () => {
  async function initiate(service: ConfirmationsService, usersService: any) {
    usersService.prepareCreateUser.mockResolvedValue({
      username: 'confirmee',
      passwordHash: 'hashed',
      fullName: 'Confirmee',
      role: UserRole.accountant,
      initiatorId: director.id,
    });
    return service.initiateCreateUser(director, {} as any);
  }

  function extractCode(email: any): string {
    const text = email.send.mock.calls[0][0].text as string;
    const match = text.match(/Код подтверждения: ([A-Z0-9]{8})/);
    if (!match) throw new Error('code not found in test email body');
    return match[1];
  }

  it('executes the underlying action and marks the PendingAction confirmed on the correct code', async () => {
    const { service, email, usersService, prisma } = buildHarness();
    const { pendingActionId: pendingId } = await initiate(service, usersService);
    const code = extractCode(email);

    const result = await service.confirm(director, pendingId, code);

    expect(usersService.executeCreateUser).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('created-1');
    expect(prisma.pendingAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // The claim also re-checks expiry atomically (expiresAt > now).
        where: expect.objectContaining({ id: pendingId, status: PendingActionStatus.pending }),
        data: expect.objectContaining({ status: PendingActionStatus.confirmed }),
      }),
    );
  });

  it('rejects an incorrect code without executing the action, and increments attempts', async () => {
    const { service, email, usersService, prisma } = buildHarness();
    const { pendingActionId: pendingId } = await initiate(service, usersService);
    void email;

    await expect(service.confirm(director, pendingId, 'WRONGCODE')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(usersService.executeCreateUser).not.toHaveBeenCalled();

    const record = await prisma.pendingAction.findUnique({ where: { id: pendingId } });
    expect(record.attempts).toBe(1);
    expect(record.status).toBe(PendingActionStatus.pending);
  });

  it('locks the PendingAction (status=failed) after exceeding max attempts', async () => {
    const { service, usersService, prisma } = buildHarness();
    const { pendingActionId: pendingId } = await initiate(service, usersService);

    for (let i = 0; i < 3; i++) {
      await expect(service.confirm(director, pendingId, 'WRONGCODE')).rejects.toThrow(
        UnauthorizedException,
      );
    }

    const record = await prisma.pendingAction.findUnique({ where: { id: pendingId } });
    expect(record.status).toBe(PendingActionStatus.failed);
  });

  it('rejects confirming an already-resolved PendingAction', async () => {
    const { service, email, usersService } = buildHarness();
    const { pendingActionId: pendingId } = await initiate(service, usersService);
    const code = extractCode(email);

    await service.confirm(director, pendingId, code);
    await expect(service.confirm(director, pendingId, code)).rejects.toThrow(ConflictException);
  });

  it('rejects confirming an expired PendingAction, even with the correct code', async () => {
    const { service, email, usersService, prisma } = buildHarness();
    const { pendingActionId: pendingId } = await initiate(service, usersService);
    const code = extractCode(email);

    const record = await prisma.pendingAction.findUnique({ where: { id: pendingId } });
    record.expiresAt = new Date(Date.now() - 1000);

    await expect(service.confirm(director, pendingId, code)).rejects.toThrow(ConflictException);
    expect(record.status).toBe(PendingActionStatus.expired);
  });

  it('marks the PendingAction failed (not left dangling as pending) if execution errors after a correct code', async () => {
    const { service, email, usersService, prisma, audit } = buildHarness();
    const { pendingActionId: pendingId } = await initiate(service, usersService);
    const code = extractCode(email);

    usersService.executeCreateUser.mockRejectedValueOnce(new ConflictException('USERNAME_TAKEN'));

    await expect(service.confirm(director, pendingId, code)).rejects.toThrow(ConflictException);

    const record = await prisma.pendingAction.findUnique({ where: { id: pendingId } });
    expect(record.status).toBe(PendingActionStatus.failed);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PENDING_ACTION_CONFIRM_FAILED' }),
    );
  });
});

describe('ConfirmationsService.reject', () => {
  it('a Director can reject a pending action, which can then no longer be confirmed', async () => {
    const { service, email, usersService } = buildHarness();
    usersService.prepareCreateUser.mockResolvedValue({
      username: 'rejectme',
      passwordHash: 'hashed',
      fullName: 'Reject Me',
      role: UserRole.accountant,
      initiatorId: director.id,
    });
    const { pendingActionId: pendingId } = await service.initiateCreateUser(director, {} as any);
    const code = (email.send.mock.calls[0][0].text as string).match(/Код подтверждения: ([A-Z0-9]{8})/)![1];

    await service.reject(director, pendingId);
    await expect(service.confirm(director, pendingId, code)).rejects.toThrow(ConflictException);
  });
});

describe('ConfirmationsService.listPending', () => {
  it('lists pending actions without exposing the code or password hash', async () => {
    const { service, usersService } = buildHarness();
    usersService.prepareCreateUser.mockResolvedValue({
      username: 'listedcreate',
      passwordHash: 'SUPER-SECRET-HASH',
      fullName: 'Listed Create',
      role: UserRole.accountant,
      initiatorId: director.id,
    });
    await service.initiateCreateUser(director, {} as any);

    const list = await service.listPending();
    expect(list).toHaveLength(1);
    expect(list[0].summary).toContain('listedcreate');
    expect(JSON.stringify(list)).not.toContain('SUPER-SECRET-HASH');
    expect(JSON.stringify(list)).not.toMatch(/codeHash/i);
  });

  it('auto-expires an overdue pending action instead of listing it', async () => {
    const { service, usersService, prisma } = buildHarness();
    usersService.prepareCreateUser.mockResolvedValue({
      username: 'expireme',
      passwordHash: 'hashed',
      fullName: 'Expire Me',
      role: UserRole.accountant,
      initiatorId: director.id,
    });
    const { pendingActionId: pendingId } = await service.initiateCreateUser(director, {} as any);
    const record = await prisma.pendingAction.findUnique({ where: { id: pendingId } });
    record.expiresAt = new Date(Date.now() - 1000);

    const list = await service.listPending();
    expect(list).toHaveLength(0);
    expect(record.status).toBe(PendingActionStatus.expired);
  });
});
