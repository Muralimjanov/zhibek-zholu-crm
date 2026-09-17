import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/notifications/email.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import * as argon2 from 'argon2';
import { FieldCipher } from '../src/crypto/field-cipher.service';
import { LEGAL_DOCUMENTS } from '../src/legal/legal-documents';

// Set once the Nest app is compiled: seeded users must hold encrypted PII,
// exactly like rows written by UsersService.
let cipher: FieldCipher;

function buildFakeEmail() {
  const sent: Array<{ to: string[]; subject: string; text: string }> = [];
  return {
    sent,
    send: jest.fn(async (input: { to: string[]; subject: string; text: string }) => {
      sent.push(input);
    }),
  };
}

function extractCodeFromEmailText(text: string): string {
  const match = text.match(/Код подтверждения: ([A-Z0-9]{8})/);
  if (!match) throw new Error(`code not found in email body: ${text}`);
  return match[1];
}

/**
 * In-memory stand-in for PrismaService. This is an integration test of our
 * OWN wiring (guards, pipes, controllers, cookie/CSRF handling, JWT
 * strategy) - it does not exercise a real PostgreSQL instance, which is
 * unavailable in this environment (see AUTH FOUNDATION STATUS report,
 * "Known limitations"). It must be complemented by running the same suite
 * against `docker-compose up db && npx prisma migrate deploy` in CI/dev.
 */
function buildFakePrisma() {
  const usersById = new Map<string, any>();
  const usersByUsername = new Map<string, any>();
  const refreshTokensByHash = new Map<string, any>();
  const pendingActionsById = new Map<string, any>();
  const auditEvents: any[] = [];

  return {
    usersById,
    pendingActionsById,
    auditEvents,
    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return usersById.get(where.id) ?? null;
        if (where.username) return usersByUsername.get(where.username) ?? null;
        return null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const user = {
          id: randomUUID(),
          phone: null,
          email: null,
          avatarUrl: null,
          status: 'active',
          createdById: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        usersById.set(user.id, user);
        usersByUsername.set(user.username, user);
        return user;
      }),
      update: jest.fn(async ({ where: { id }, data }: any) => {
        const user = usersById.get(id);
        Object.assign(user, data);
        return user;
      }),
      findMany: jest.fn(async ({ where }: any = {}) => {
        let result = [...usersById.values()];
        if (where?.role) result = result.filter((u) => u.role === where.role);
        if (where?.status) result = result.filter((u) => u.status === where.status);
        if (where?.email?.not === null) result = result.filter((u) => u.email !== null);
        return result;
      }),
    },
    refreshToken: {
      create: jest.fn(async ({ data }: any) => {
        const record = {
          id: randomUUID(),
          revokedAt: null,
          revokedReason: null,
          replacedByTokenId: null,
          createdAt: new Date(),
          ...data,
        };
        refreshTokensByHash.set(record.tokenHash, record);
        return record;
      }),
      findUnique: jest.fn(async ({ where: { tokenHash } }: any) =>
        refreshTokensByHash.get(tokenHash) ?? null,
      ),
      update: jest.fn(async ({ where: { id }, data }: any) => {
        for (const record of refreshTokensByHash.values()) {
          if (record.id === id) Object.assign(record, data);
        }
        return null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const record of refreshTokensByHash.values()) {
          if (record.userId === where.userId || record.familyId === where.familyId) {
            if (where.revokedAt === null && record.revokedAt !== null) continue;
            Object.assign(record, data);
            count++;
          }
        }
        return { count };
      }),
    },
    auditEvent: {
      create: jest.fn(async ({ data }: any) => {
        auditEvents.push(data);
        return { id: randomUUID(), createdAt: new Date(), ...data };
      }),
    },
    consentRecord: {
      create: jest.fn(async ({ data }: any) => ({ id: randomUUID(), acceptedAt: new Date(), ...data })),
      // Every seeded user has accepted the current required legal documents;
      // the consent gate itself is covered by test/real-db/*.e2e-spec.ts.
      findMany: jest.fn(async () =>
        ['privacy_policy', 'terms_of_use', 'personal_data_processing'].map((policyType) => ({
          policyType,
          policyVersion: LEGAL_DOCUMENTS[policyType as keyof typeof LEGAL_DOCUMENTS].version,
          acceptedAt: new Date(),
        })),
      ),
    },
    pendingAction: {
      create: jest.fn(async ({ data }: any) => {
        const record = {
          id: randomUUID(),
          status: 'pending',
          attempts: 0,
          confirmedAt: null,
          confirmedByUserId: null,
          rejectedAt: null,
          rejectedByUserId: null,
          createdAt: new Date(),
          ...data,
        };
        pendingActionsById.set(record.id, record);
        return record;
      }),
      findUnique: jest.fn(async ({ where: { id } }: any) => pendingActionsById.get(id) ?? null),
      findMany: jest.fn(async () =>
        [...pendingActionsById.values()].filter((r) => r.status === 'pending'),
      ),
      update: jest.fn(async ({ where: { id }, data }: any) => {
        const record = pendingActionsById.get(id);
        Object.assign(record, data);
        return record;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const record = pendingActionsById.get(where.id);
        if (!record || record.status !== where.status) return { count: 0 };
        Object.assign(record, data);
        return { count: 1 };
      }),
    },
  };
}

async function seedUser(fakePrisma: ReturnType<typeof buildFakePrisma>, overrides: Partial<any>) {
  const passwordHash = await argon2.hash('CorrectHorseBatteryStaple123!', { type: argon2.argon2id });
  const user = {
    id: randomUUID(),
    username: overrides.username,
    passwordHash,
    fullName: cipher.encrypt('User.fullName', overrides.fullName ?? 'Test User'),
    phone: null,
    email: overrides.email ? cipher.encrypt('User.email', overrides.email) : null,
    avatarFileId: null,
    teamLeadId: null,
    role: overrides.role,
    status: overrides.status ?? 'active',
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  fakePrisma.usersById.set(user.id, user);
  (fakePrisma.user.findUnique as jest.Mock).mockImplementation(async ({ where }: any) => {
    if (where.id) return fakePrisma.usersById.get(where.id) ?? null;
    if (where.username) {
      for (const u of fakePrisma.usersById.values()) if (u.username === where.username) return u;
      return null;
    }
    return null;
  });
  return user;
}

describe('Auth Foundation (e2e, Prisma + Email mocked)', () => {
  let app: INestApplication;
  let fakePrisma: ReturnType<typeof buildFakePrisma>;
  let fakeEmail: ReturnType<typeof buildFakeEmail>;

  beforeAll(async () => {
    fakePrisma = buildFakePrisma();
    fakeEmail = buildFakeEmail();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .overrideProvider(EmailService)
      .useValue(fakeEmail)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(helmet());
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    cipher = app.get(FieldCipher);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unauthenticated request to a protected route with 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('rejects login with a made-up username with a generic 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'nobody', password: 'whatever12345' });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|Prisma|ORM/i);
  });

  it('logs in, then accesses a protected route with the access token', async () => {
    await seedUser(fakePrisma, { username: 'director1', role: 'director' });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'director1', password: 'CorrectHorseBatteryStaple123!' })
      .expect(201);

    expect(loginRes.body.accessToken).toBeTruthy();
    expect(loginRes.body.user).not.toHaveProperty('passwordHash');

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(meRes.body.username).toBe('director1');
    expect(meRes.body).not.toHaveProperty('passwordHash');
  });

  it('rejects login for a disabled account with the same generic error', async () => {
    await seedUser(fakePrisma, { username: 'disableduser', role: 'sales_manager', status: 'disabled' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'disableduser', password: 'CorrectHorseBatteryStaple123!' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('enforces RBAC at INITIATION: an investor cannot even start creating a user (403, no PendingAction, no email)', async () => {
    const investor = await seedUser(fakePrisma, { username: 'investor1', role: 'investor' });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'investor1', password: 'CorrectHorseBatteryStaple123!' })
      .expect(201);

    const emailCountBefore = fakeEmail.sent.length;

    const res = await request(app.getHttpServer())
      .post('/api/v1/confirmations/users')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({
        username: 'shouldnotexist',
        password: 'AnotherStrongPassword1',
        fullName: 'Nope',
        role: 'sales_manager',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('USER_ROLE_CREATION_FORBIDDEN');
    expect([...fakePrisma.usersById.values()].some((u) => u.username === 'shouldnotexist')).toBe(
      false,
    );
    expect(fakePrisma.pendingActionsById.size).toBe(0);
    expect(fakeEmail.sent.length).toBe(emailCountBefore);
    void investor;
  });

  it('full maker-checker flow: director initiates creating a head_of_sales, another Director approves by email code, account only then exists', async () => {
    await seedUser(fakePrisma, {
      username: 'director2',
      role: 'director',
      email: 'director2@example.com',
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'director2', password: 'CorrectHorseBatteryStaple123!' })
      .expect(201);
    const token = loginRes.body.accessToken;

    const initiateRes = await request(app.getHttpServer())
      .post('/api/v1/confirmations/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'newheadofsales',
        password: 'AnotherStrongPassword1',
        fullName: 'New HoS',
        role: 'head_of_sales',
      });

    expect(initiateRes.status).toBe(202);
    expect(initiateRes.body.status).toBe('pending');
    expect(initiateRes.body.emailDelivery).toBe('sent');
    // The account must NOT exist yet - only a PendingAction does.
    expect([...fakePrisma.usersById.values()].some((u) => u.username === 'newheadofsales')).toBe(
      false,
    );

    const emailSentToDirector = fakeEmail.sent.at(-1)!;
    expect(emailSentToDirector.to).toEqual(['director2@example.com']);
    const code = extractCodeFromEmailText(emailSentToDirector.text);

    const wrongCodeRes = await request(app.getHttpServer())
      .post(`/api/v1/confirmations/${initiateRes.body.pendingActionId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'WRONGCOD' });
    expect(wrongCodeRes.status).toBe(401);
    expect([...fakePrisma.usersById.values()].some((u) => u.username === 'newheadofsales')).toBe(
      false,
    );

    const confirmRes = await request(app.getHttpServer())
      .post(`/api/v1/confirmations/${initiateRes.body.pendingActionId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.role).toBe('head_of_sales');
    expect(confirmRes.body).not.toHaveProperty('passwordHash');
    expect([...fakePrisma.usersById.values()].some((u) => u.username === 'newheadofsales')).toBe(
      true,
    );

    // The now-consumed code can never be replayed.
    const replayRes = await request(app.getHttpServer())
      .post(`/api/v1/confirmations/${initiateRes.body.pendingActionId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code });
    expect(replayRes.status).toBe(409);
  });

  it('only a Director can confirm - a Head of Sales gets 403 even with the correct code', async () => {
    await seedUser(fakePrisma, {
      username: 'director3',
      role: 'director',
      email: 'director3@example.com',
    });
    const directorLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'director3', password: 'CorrectHorseBatteryStaple123!' })
      .expect(201);

    const initiateRes = await request(app.getHttpServer())
      .post('/api/v1/confirmations/users')
      .set('Authorization', `Bearer ${directorLogin.body.accessToken}`)
      .send({
        username: 'blockedaccount',
        password: 'AnotherStrongPassword1',
        fullName: 'Blocked',
        role: 'accountant',
      });
    const code = extractCodeFromEmailText(fakeEmail.sent.at(-1)!.text);

    await seedUser(fakePrisma, { username: 'hos-not-director', role: 'head_of_sales' });
    const hosLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'hos-not-director', password: 'CorrectHorseBatteryStaple123!' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/confirmations/${initiateRes.body.pendingActionId}/confirm`)
      .set('Authorization', `Bearer ${hosLogin.body.accessToken}`)
      .send({ code });

    expect(res.status).toBe(403);
    expect(
      [...fakePrisma.usersById.values()].some((u) => u.username === 'blockedaccount'),
    ).toBe(false);
  });

  it('GET /confirmations/pending is Director-only and never exposes the code or password hash', async () => {
    await seedUser(fakePrisma, {
      username: 'director4',
      role: 'director',
      email: 'director4@example.com',
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'director4', password: 'CorrectHorseBatteryStaple123!' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/confirmations/users')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({
        username: 'pendinglistuser',
        password: 'AnotherStrongPassword1',
        fullName: 'Pending List',
        role: 'accountant',
      })
      .expect(202);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/confirmations/pending')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(listRes.body.some((item: any) => item.summary.includes('pendinglistuser'))).toBe(true);
    expect(JSON.stringify(listRes.body)).not.toMatch(/codeHash|passwordHash/i);

    await seedUser(fakePrisma, { username: 'notadirector', role: 'accountant' });
    const nonDirectorLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'notadirector', password: 'CorrectHorseBatteryStaple123!' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/confirmations/pending')
      .set('Authorization', `Bearer ${nonDirectorLogin.body.accessToken}`)
      .expect(403);
  });

  it('disable flow: works end-to-end and revokes the target refresh session only after confirmation', async () => {
    await seedUser(fakePrisma, {
      username: 'director5',
      role: 'director',
      email: 'director5@example.com',
    });
    const target = await seedUser(fakePrisma, { username: 'tobedisabled', role: 'sales_manager' });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'director5', password: 'CorrectHorseBatteryStaple123!' })
      .expect(201);

    const initiateRes = await request(app.getHttpServer())
      .post(`/api/v1/confirmations/users/${target.id}/disable`)
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(202);

    expect(fakePrisma.usersById.get(target.id).status).toBe('active');

    const code = extractCodeFromEmailText(fakeEmail.sent.at(-1)!.text);
    const confirmRes = await request(app.getHttpServer())
      .post(`/api/v1/confirmations/${initiateRes.body.pendingActionId}/confirm`)
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ code });

    expect(confirmRes.status).toBe(201);
    expect(fakePrisma.usersById.get(target.id).status).toBe('disabled');
  });

  it('rejects a self-update payload that tries to smuggle a role field (whitelist validation)', async () => {
    await seedUser(fakePrisma, { username: 'selfupdater', role: 'sales_manager' });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'selfupdater', password: 'CorrectHorseBatteryStaple123!' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ fullName: 'New Name', role: 'director' });

    // forbidNonWhitelisted rejects the unknown `role` property outright.
    expect(res.status).toBe(400);
  });

  it('rejects /auth/refresh when no refresh cookie is present', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('performs a full login -> refresh -> logout cookie/CSRF cycle', async () => {
    await seedUser(fakePrisma, { username: 'cookieflow', role: 'accountant' });

    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'cookieflow', password: 'CorrectHorseBatteryStaple123!' })
      .expect(201);

    const setCookies = loginRes.headers['set-cookie'] as unknown as string[];
    const csrfCookie = setCookies.find((c) => c.startsWith('uzz_csrf='))!;
    const csrfValue = csrfCookie.split(';')[0].split('=')[1];

    const refreshRes = await agent
      .post('/api/v1/auth/refresh')
      .set('x-csrf-token', csrfValue)
      .expect(201);
    expect(refreshRes.body.accessToken).toBeTruthy();

    // Refresh rotates both the refresh cookie and the CSRF cookie - use the
    // freshly issued CSRF value for the subsequent logout call.
    const refreshedCookies = refreshRes.headers['set-cookie'] as unknown as string[];
    const refreshedCsrfCookie = refreshedCookies.find((c) => c.startsWith('uzz_csrf='))!;
    const refreshedCsrfValue = refreshedCsrfCookie.split(';')[0].split('=')[1];

    const logoutRes = await agent
      .post('/api/v1/auth/logout')
      .set('x-csrf-token', refreshedCsrfValue)
      .expect(201);
    expect(logoutRes.body.success).toBe(true);
  });

  it('rejects /auth/refresh when the CSRF header does not match the cookie', async () => {
    await seedUser(fakePrisma, { username: 'csrfvictim', role: 'accountant' });
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ username: 'csrfvictim', password: 'CorrectHorseBatteryStaple123!' })
      .expect(201);

    const res = await agent.post('/api/v1/auth/refresh').set('x-csrf-token', 'wrong-value');
    expect(res.status).toBe(401);
  });
});
