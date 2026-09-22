/**
 * Integration tests against a REAL PostgreSQL database and REAL SMTP
 * delivery (local Mailpit). Nothing is mocked except the throttler storage
 * in the non-rate-limit tests.
 *
 *   docker compose -f docker-compose.dev.yml up -d mailpit
 *   npm run test:e2e:real-db
 *
 * Every table in DATABASE_URL_TEST is TRUNCATEd before each test; see
 * test/real-db/guard.ts for the checks that keep this away from uzz_crm.
 */
import { INestApplication } from '@nestjs/common';
import { PendingActionStatus, PrismaClient, User, UserRole, UserStatus } from '@prisma/client';
import { createHash } from 'crypto';
import request from 'supertest';
import { assertConnectedToTestDatabase } from './real-db/guard';
import {
  API,
  PASSWORD,
  Session,
  bearer,
  cookiesFrom,
  createApp,
  login,
  loginResponse,
  refreshWith,
  seedUser,
  sessionFrom,
  sleep,
  testCipher,
  truncateAll,
  uniq,
} from './real-db/harness';
import { LEGAL_DOCUMENTS } from '../src/legal/legal-documents';
import { extractCode, findMessages, totalMessages, waitForMessages } from './real-db/mailpit';

// Defense in depth: refuse even if this file is run under a different jest config.
assertConnectedToTestDatabase();

const ALL_ROLES = Object.values(UserRole);
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('Auth Foundation — real PostgreSQL + real SMTP (Mailpit)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  /** Initiates creation of a user and returns the pending action id + emailed code. */
  async function initiateCreate(initiator: Session, role: UserRole, username = uniq('new')) {
    const res = await http()
      .post(`${API}/confirmations/users`)
      .set(...bearer(initiator))
      .send({ username, password: PASSWORD, fullName: 'New Person', email: `${username.toLowerCase()}@created.test`, role });
    expect(res.status).toBe(202);
    const [message] = await waitForMessages(res.body.pendingActionId);
    return { res, username, pendingActionId: res.body.pendingActionId as string, code: extractCode(message.Text), message };
  }

  async function directorWithSession(email = `${uniq('dir')}@test.local`): Promise<{ user: User; session: Session }> {
    const user = await seedUser(prisma, { role: UserRole.director, email });
    return { user, session: await login(app, user.username) };
  }

  // ===================================================================
  // Auth
  // ===================================================================
  describe('Auth', () => {
    it('login success: access token + HttpOnly refresh cookie; DB stores only the token hash', async () => {
      const user = await seedUser(prisma, { role: UserRole.accountant });
      // Password step + emailed code (harness reads it from Mailpit).
      const res = await loginResponse(app, user.username);

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({ id: user.id, role: UserRole.accountant });
      expect(res.body.user).not.toHaveProperty('passwordHash');

      const cookies = cookiesFrom(res);
      expect(res.body.csrfToken).toBe(cookies.uzz_csrf.value);
      expect(cookies.uzz_refresh.raw).toMatch(/HttpOnly/i);
      expect(cookies.uzz_refresh.raw).toMatch(/Path=\/api\/v1\/auth/);
      expect(cookies.uzz_csrf.raw).not.toMatch(/HttpOnly/i);

      const [row] = await prisma.refreshToken.findMany({ where: { userId: user.id } });
      expect(row.tokenHash).toBe(sha256(cookies.uzz_refresh.value));
      expect(row.tokenHash).not.toBe(cookies.uzz_refresh.value);
    });

    it('unknown username, wrong password and disabled account all return the identical 401 body', async () => {
      const active = await seedUser(prisma, { role: UserRole.investor });
      const disabled = await seedUser(prisma, { role: UserRole.investor, status: UserStatus.disabled });

      const unknown = await http().post(`${API}/auth/login`).send({ username: 'no_such_user', password: PASSWORD });
      const wrong = await http().post(`${API}/auth/login`).send({ username: active.username, password: 'wrong-password-1' });
      const off = await http().post(`${API}/auth/login`).send({ username: disabled.username, password: PASSWORD });

      for (const res of [unknown, wrong, off]) {
        expect(res.status).toBe(401);
        expect(res.body).toEqual(unknown.body);
        expect(res.headers['set-cookie']).toBeUndefined();
      }
      expect(unknown.body.message).toBe('AUTH_INVALID_CREDENTIALS');
      expect(await prisma.refreshToken.count()).toBe(0);
    });

    it('refresh success rotates: new token issued, old row revoked as "rotated" and linked to the new one', async () => {
      const user = await seedUser(prisma, { role: UserRole.accountant });
      const first = await login(app, user.username);

      const res = await refreshWith(app, first);
      expect(res.status).toBe(201);
      const second = sessionFrom(res);
      expect(second.refreshToken).not.toBe(first.refreshToken);

      const oldRow = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: sha256(first.refreshToken) } });
      const newRow = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: sha256(second.refreshToken) } });
      expect(oldRow.revokedAt).not.toBeNull();
      expect(oldRow.revokedReason).toBe('rotated');
      expect(oldRow.replacedByTokenId).toBe(newRow.id);
      expect(newRow.familyId).toBe(oldRow.familyId);
      expect(newRow.revokedAt).toBeNull();

      await http().get(`${API}/auth/me`).set(...bearer(second)).expect(200);
    });

    it('refresh without a refresh cookie -> 401', async () => {
      const res = await http()
        .post(`${API}/auth/refresh`)
        .set('Cookie', 'uzz_csrf=abc')
        .set('x-csrf-token', 'abc');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('AUTH_REFRESH_INVALID');
    });

    it('refresh with an expired token -> 401 and no new token is issued', async () => {
      const user = await seedUser(prisma, { role: UserRole.accountant });
      const session = await login(app, user.username);
      await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

      const res = await refreshWith(app, session);
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('AUTH_REFRESH_INVALID');
      expect(await prisma.refreshToken.count()).toBe(1);
    });

    it('refresh with a CSRF header that does not match the cookie -> 401, token NOT rotated', async () => {
      const user = await seedUser(prisma, { role: UserRole.accountant });
      const session = await login(app, user.username);

      const res = await http()
        .post(`${API}/auth/refresh`)
        .set('Cookie', session.cookieHeader)
        .set('x-csrf-token', 'attacker-guess');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('AUTH_CSRF_INVALID');

      const row = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: sha256(session.refreshToken) } });
      expect(row.revokedAt).toBeNull();
    });

    it('reuse of a rotated refresh token burns the whole family, including the newest token', async () => {
      const user = await seedUser(prisma, { role: UserRole.accountant });
      const first = await login(app, user.username);
      const second = sessionFrom(await refreshWith(app, first).expect(201));

      // Attacker replays the old token.
      const replay = await refreshWith(app, first);
      expect(replay.status).toBe(401);

      // The legitimate newest token from the same pair is dead too.
      const legit = await refreshWith(app, second);
      expect(legit.status).toBe(401);

      const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
      expect(rows.find((r) => r.tokenHash === sha256(second.refreshToken))?.revokedReason).toBe('reuse_detected');
      expect(await prisma.auditEvent.count({ where: { action: 'REFRESH_REUSE_DETECTED' } })).toBeGreaterThanOrEqual(1);
    });

    it('concurrent refreshes with the same token: at most one succeeds and the family ends up revoked', async () => {
      const user = await seedUser(prisma, { role: UserRole.accountant });
      const session = await login(app, user.username);

      const results = await Promise.all([refreshWith(app, session), refreshWith(app, session), refreshWith(app, session)]);
      const ok = results.filter((r) => r.status === 201);
      expect(ok.length).toBeLessThanOrEqual(1);
      expect(results.filter((r) => r.status === 401).length).toBeGreaterThanOrEqual(2);

      const live = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
      expect(live).toBe(0);
    });

    it('logout revokes the session family, clears cookies, and the refresh token stops working', async () => {
      const user = await seedUser(prisma, { role: UserRole.accountant });
      const session = await login(app, user.username);

      const res = await http()
        .post(`${API}/auth/logout`)
        .set('Cookie', session.cookieHeader)
        .set('x-csrf-token', session.csrfToken);
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true });

      const cleared = cookiesFrom(res);
      expect(cleared.uzz_refresh.value).toBe('');
      expect(cleared.uzz_refresh.raw).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(cleared.uzz_refresh.raw).toMatch(/Path=\/api\/v1\/auth/);

      const row = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: sha256(session.refreshToken) } });
      expect(row.revokedReason).toBe('logout');
      expect((await refreshWith(app, session)).status).toBe(401);

      const audit = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'LOGOUT' } });
      expect(audit.actorUserId).toBe(user.id);
    });

    it('access token expires according to JWT_ACCESS_TTL_SECONDS (GATES.md Gate 3)', async () => {
      const user = await seedUser(prisma, { role: UserRole.accountant });
      process.env.JWT_ACCESS_TTL_SECONDS = '1';
      let session: Session;
      try {
        const res = await loginResponse(app, user.username);
        expect(res.body.expiresIn).toBe(1);
        session = sessionFrom(res);
      } finally {
        delete process.env.JWT_ACCESS_TTL_SECONDS;
      }
      await http().get(`${API}/auth/me`).set(...bearer(session)).expect(200);
      await sleep(2100);
      await http().get(`${API}/auth/me`).set(...bearer(session)).expect(401);
    });

    it('GET /auth/me: 401 without a token, safe profile with one, 401 once the account is disabled', async () => {
      await http().get(`${API}/auth/me`).expect(401);
      await http().get(`${API}/auth/me`).set('Authorization', 'Bearer not-a-jwt').expect(401);

      const user = await seedUser(prisma, { role: UserRole.head_of_sales, email: 'hos@test.local' });
      const session = await login(app, user.username);

      const me = await http().get(`${API}/auth/me`).set(...bearer(session));
      expect(me.status).toBe(200);
      expect(Object.keys(me.body).sort()).toEqual(
        ['avatarUrl', 'createdAt', 'email', 'emailVerified', 'fullName', 'id', 'phone', 'role', 'status', 'teamLeadId', 'username'].sort(),
      );

      await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.disabled } });
      const after = await http().get(`${API}/auth/me`).set(...bearer(session));
      expect(after.status).toBe(401);
    });
  });

  // ===================================================================
  // Users
  // ===================================================================
  describe('Users', () => {
    it('PATCH /users/me updates own profile fields in the database', async () => {
      const user = await seedUser(prisma, { role: UserRole.sales_manager });
      const session = await login(app, user.username);

      const res = await http()
        .patch(`${API}/users/me`)
        .set(...bearer(session))
        .send({ fullName: 'Renamed', phone: '+996555000111' });
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('passwordHash');
      const email = `${user.username.toLowerCase()}@users.test`;
      expect(res.body).toMatchObject({ fullName: 'Renamed', phone: '+996555000111', email });

      // The email (where login codes go) is not editable here - only via the two-code flow.
      const smuggled = await http().patch(`${API}/users/me`).set(...bearer(session)).send({ email: 'attacker@evil.test' });
      expect(smuggled.status).toBe(400);

      // At rest the PII is ciphertext, bound to its column.
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.role).toBe(UserRole.sales_manager);
      for (const [column, plain] of [['fullName', 'Renamed'], ['phone', '+996555000111'], ['email', email]] as const) {
        expect(row[column]).toMatch(/^enc:v1:/);
        expect(row[column]).not.toContain(plain);
        expect(testCipher().decrypt(`User.${column}`, row[column]!)).toBe(plain);
      }

      // A client-supplied avatar URL is no longer accepted (tracking/SSRF-style abuse).
      await http().patch(`${API}/users/me`).set(...bearer(session)).send({ avatarUrl: 'https://evil.test/x.png' }).expect(400);
    });

    it('PATCH /users/me with a smuggled role -> 400 and the role is unchanged', async () => {
      const user = await seedUser(prisma, { role: UserRole.sales_manager });
      const session = await login(app, user.username);

      const res = await http().patch(`${API}/users/me`).set(...bearer(session)).send({ fullName: 'X', role: 'director' });
      expect(res.status).toBe(400);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.role).toBe(UserRole.sales_manager);
      expect(row.fullName).not.toBe('X');
    });

    it('GET /users/:id: owner, creator and director see it; unrelated manager 403; unknown id 404', async () => {
      const director = await seedUser(prisma, { role: UserRole.director });
      const hos = await seedUser(prisma, { role: UserRole.head_of_sales });
      const target = await seedUser(prisma, { role: UserRole.sales_manager, createdById: hos.id });
      const stranger = await seedUser(prisma, { role: UserRole.sales_manager });

      for (const viewer of [target, hos, director]) {
        const session = await login(app, viewer.username);
        const res = await http().get(`${API}/users/${target.id}`).set(...bearer(session));
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(target.id);
        expect(res.body).not.toHaveProperty('passwordHash');
      }

      const strangerSession = await login(app, stranger.username);
      expect((await http().get(`${API}/users/${target.id}`).set(...bearer(strangerSession))).status).toBe(403);

      const directorSession = await login(app, director.username);
      const missing = await http()
        .get(`${API}/users/00000000-0000-4000-8000-000000000000`)
        .set(...bearer(directorSession));
      expect(missing.status).toBe(404);
    });
  });

  // ===================================================================
  // Confirmations (maker-checker)
  // ===================================================================
  describe('Confirmations', () => {
    it('role-creation matrix for every role pair: allowed -> 202; forbidden -> 403 with no PendingAction and no email', async () => {
      await seedUser(prisma, { role: UserRole.director, email: 'matrix-dir@test.local' });
      const allowed: Record<UserRole, UserRole[]> = {
        director: [UserRole.head_of_sales, UserRole.accountant, UserRole.investor, UserRole.reception],
        head_of_sales: [UserRole.sales_manager],
        sales_manager: [],
        accountant: [],
        investor: [],
        reception: [],
      };

      const mailBefore = await totalMessages();
      const forbiddenUsernames: string[] = [];
      const allowedIds: string[] = [];

      for (const creatorRole of ALL_ROLES) {
        const creator = await seedUser(prisma, { role: creatorRole });
        const session = await login(app, creator.username);
        for (const targetRole of ALL_ROLES) {
          const username = uniq(`m_${creatorRole}_${targetRole}`);
          const before = await prisma.pendingAction.count();
          const res = await http()
            .post(`${API}/confirmations/users`)
            .set(...bearer(session))
            .send({ username, password: PASSWORD, fullName: 'Matrix', email: `${username.toLowerCase()}@created.test`, role: targetRole });

          if (allowed[creatorRole].includes(targetRole)) {
            expect({ creatorRole, targetRole, status: res.status }).toEqual({ creatorRole, targetRole, status: 202 });
            allowedIds.push(res.body.pendingActionId);
          } else {
            expect({ creatorRole, targetRole, status: res.status }).toEqual({ creatorRole, targetRole, status: 403 });
            expect(res.body.message).toBe('USER_ROLE_CREATION_FORBIDDEN');
            expect(await prisma.pendingAction.count()).toBe(before);
            forbiddenUsernames.push(username);
          }
        }
      }

      // 5 разрешённых пар: директор создаёт 4 роли (включая ресепшен), начальник продаж — менеджера.
      expect(allowedIds).toHaveLength(5);
      for (const id of allowedIds) await waitForMessages(id);
      // One approval email per allowed request + one login code per creator.
      expect((await totalMessages()) - mailBefore).toBe(allowedIds.length + ALL_ROLES.length);
      for (const username of forbiddenUsernames) {
        expect(await findMessages(username)).toHaveLength(0);
      }
      expect(await prisma.user.count({ where: { username: { startsWith: 'm_' } } })).toBe(0);
    });

    it('the code is emailed to every ACTIVE Director with an email — and only to them', async () => {
      const d1Email = `${uniq('d1')}@test.local`;
      const d2Email = `${uniq('d2')}@test.local`;
      const d1 = await directorWithSession(d1Email);
      await seedUser(prisma, { role: UserRole.director, email: d2Email });
      await seedUser(prisma, { role: UserRole.director, email: null });
      await seedUser(prisma, { role: UserRole.director, status: UserStatus.disabled, email: `${uniq('off')}@test.local` });
      await seedUser(prisma, { role: UserRole.head_of_sales, email: `${uniq('hos')}@test.local` });

      const { res, message, code } = await initiateCreate(d1.session, UserRole.accountant);

      expect(res.body).toMatchObject({ status: 'pending', emailDelivery: 'sent', type: 'create_user' });
      expect(JSON.stringify(res.body)).not.toContain(code);
      expect(res.body).not.toHaveProperty('code');
      expect(message.To.map((t) => t.Address).sort()).toEqual([d1Email, d2Email].sort());
      expect(d1.user.email).not.toContain(d1Email); // stored encrypted

      const row = await prisma.pendingAction.findUniqueOrThrow({ where: { id: res.body.pendingActionId } });
      expect(row.codeHash).not.toContain(code);
      expect(JSON.stringify(row.payload)).not.toContain(PASSWORD);
    });

    it('wrong code -> 401 and the attempt counter grows', async () => {
      const d = await directorWithSession();
      const { pendingActionId } = await initiateCreate(d.session, UserRole.investor);

      for (const expectedAttempts of [1, 2]) {
        const res = await http()
          .post(`${API}/confirmations/${pendingActionId}/confirm`)
          .set(...bearer(d.session))
          .send({ code: 'ZZZZZZZZ' });
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('CONFIRMATION_CODE_INVALID');
        const row = await prisma.pendingAction.findUniqueOrThrow({ where: { id: pendingActionId } });
        expect(row.attempts).toBe(expectedAttempts);
        expect(row.status).toBe(PendingActionStatus.pending);
      }
    });

    it('exceeding maxAttempts marks the action failed; afterwards even the correct code is rejected', async () => {
      const d = await directorWithSession();
      const { pendingActionId, code, username } = await initiateCreate(d.session, UserRole.investor);

      for (let i = 0; i < 5; i++) {
        await http()
          .post(`${API}/confirmations/${pendingActionId}/confirm`)
          .set(...bearer(d.session))
          .send({ code: 'ZZZZZZZZ' })
          .expect(401);
      }
      const row = await prisma.pendingAction.findUniqueOrThrow({ where: { id: pendingActionId } });
      expect(row).toMatchObject({ status: PendingActionStatus.failed, attempts: 5 });

      const res = await http()
        .post(`${API}/confirmations/${pendingActionId}/confirm`)
        .set(...bearer(d.session))
        .send({ code });
      expect(res.status).toBe(409);
      expect(await prisma.user.findUnique({ where: { username } })).toBeNull();
    });

    it('correct code -> 201, user really exists (without passwordHash in the response); replaying the code -> 409', async () => {
      const d = await directorWithSession();
      const { pendingActionId, code, username } = await initiateCreate(d.session, UserRole.head_of_sales);

      const writes: string[] = [];
      const spyOut = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      });
      const spyErr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      });
      let res;
      try {
        res = await http()
          .post(`${API}/confirmations/${pendingActionId}/confirm`)
          .set(...bearer(d.session))
          .send({ code: code.toLowerCase() });
      } finally {
        spyOut.mockRestore();
        spyErr.mockRestore();
      }

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ username, role: UserRole.head_of_sales, status: UserStatus.active });
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(writes.join('')).not.toContain(code);

      const created = await prisma.user.findUniqueOrThrow({ where: { username } });
      expect(created.createdById).toBe(d.user.id);
      expect(created.passwordHash).toMatch(/^\$argon2id\$/);
      const action = await prisma.pendingAction.findUniqueOrThrow({ where: { id: pendingActionId } });
      expect(action).toMatchObject({ status: PendingActionStatus.confirmed, confirmedByUserId: d.user.id });

      // The new account works with the password chosen by its creator.
      await login(app, username);

      const replay = await http()
        .post(`${API}/confirmations/${pendingActionId}/confirm`)
        .set(...bearer(d.session))
        .send({ code });
      expect(replay.status).toBe(409);
      expect(await prisma.user.count({ where: { username } })).toBe(1);
    });

    it('a non-Director gets 403 on confirm even with the correct code, without touching the action', async () => {
      const d = await directorWithSession();
      const { pendingActionId, code, username } = await initiateCreate(d.session, UserRole.accountant);

      for (const role of ALL_ROLES.filter((r) => r !== UserRole.director)) {
        const other = await seedUser(prisma, { role });
        const session = await login(app, other.username);
        const res = await http()
          .post(`${API}/confirmations/${pendingActionId}/confirm`)
          .set(...bearer(session))
          .send({ code });
        expect({ role, status: res.status }).toEqual({ role, status: 403 });
      }

      const row = await prisma.pendingAction.findUniqueOrThrow({ where: { id: pendingActionId } });
      expect(row).toMatchObject({ status: PendingActionStatus.pending, attempts: 0 });
      expect(await prisma.user.findUnique({ where: { username } })).toBeNull();
    });

    it('two Directors confirming the same code concurrently: exactly one 201, one 409, one user', async () => {
      const d1 = await directorWithSession();
      const d2 = await directorWithSession();
      const { pendingActionId, code, username } = await initiateCreate(d1.session, UserRole.accountant);

      const results = await Promise.all(
        [d1.session, d2.session].map((s) =>
          http().post(`${API}/confirmations/${pendingActionId}/confirm`).set(...bearer(s)).send({ code }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.user.count({ where: { username } })).toBe(1);
      const row = await prisma.pendingAction.findUniqueOrThrow({ where: { id: pendingActionId } });
      expect(row.status).toBe(PendingActionStatus.confirmed);
    });

    it('two different pending actions for the same username confirmed concurrently: one 201, one 409 (never 500)', async () => {
      const d = await directorWithSession();
      const username = uniq('dup');
      const a = await initiateCreate(d.session, UserRole.accountant, username);
      const b = await initiateCreate(d.session, UserRole.investor, username);

      const results = await Promise.all(
        [a, b].map((x) =>
          http().post(`${API}/confirmations/${x.pendingActionId}/confirm`).set(...bearer(d.session)).send({ code: x.code }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)?.body.message).toBe('USERNAME_TAKEN');
      expect(await prisma.user.count({ where: { username } })).toBe(1);
      const statuses = await prisma.pendingAction.findMany({ select: { status: true } });
      expect(statuses.map((s) => s.status).sort()).toEqual([PendingActionStatus.confirmed, PendingActionStatus.failed]);
    });

    it('reject -> a later confirm with the correct code gets 409; non-Directors cannot reject', async () => {
      const d = await directorWithSession();
      const hos = await seedUser(prisma, { role: UserRole.head_of_sales });
      const hosSession = await login(app, hos.username);
      const { pendingActionId, code, username } = await initiateCreate(hosSession, UserRole.sales_manager);

      await http().post(`${API}/confirmations/${pendingActionId}/reject`).set(...bearer(hosSession)).expect(403);

      const rejected = await http().post(`${API}/confirmations/${pendingActionId}/reject`).set(...bearer(d.session));
      expect(rejected.status).toBe(201);

      const res = await http()
        .post(`${API}/confirmations/${pendingActionId}/confirm`)
        .set(...bearer(d.session))
        .send({ code });
      expect(res.status).toBe(409);

      const row = await prisma.pendingAction.findUniqueOrThrow({ where: { id: pendingActionId } });
      expect(row).toMatchObject({ status: PendingActionStatus.rejected, rejectedByUserId: d.user.id });
      expect(await prisma.user.findUnique({ where: { username } })).toBeNull();
    });

    it('GET /confirmations/pending is Director-only and never exposes code, codeHash or passwordHash', async () => {
      const d = await directorWithSession();
      const { pendingActionId, code } = await initiateCreate(d.session, UserRole.investor);
      const row = await prisma.pendingAction.findUniqueOrThrow({ where: { id: pendingActionId } });
      const storedPasswordHash = (row.payload as { passwordHash: string }).passwordHash;

      const res = await http().get(`${API}/confirmations/pending`).set(...bearer(d.session));
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(Object.keys(res.body[0]).sort()).toEqual(
        ['createdAt', 'expiresAt', 'id', 'initiatorUserId', 'status', 'summary', 'type'].sort(),
      );
      const text = JSON.stringify(res.body);
      for (const secret of [code, row.codeHash, storedPasswordHash, PASSWORD]) {
        expect(text).not.toContain(secret);
      }

      for (const role of ALL_ROLES.filter((r) => r !== UserRole.director)) {
        const other = await seedUser(prisma, { role });
        const session = await login(app, other.username);
        expect((await http().get(`${API}/confirmations/pending`).set(...bearer(session))).status).toBe(403);
      }
    });

    it('TTL expiry: the correct code after expiry -> 409 and status "expired"', async () => {
      const d = await directorWithSession();
      process.env.CONFIRMATION_CODE_TTL_SECONDS = '2';
      let initiated;
      try {
        initiated = await initiateCreate(d.session, UserRole.accountant);
      } finally {
        process.env.CONFIRMATION_CODE_TTL_SECONDS = '600';
      }

      await sleep(2500);
      const res = await http()
        .post(`${API}/confirmations/${initiated.pendingActionId}/confirm`)
        .set(...bearer(d.session))
        .send({ code: initiated.code });
      expect(res.status).toBe(409);

      const row = await prisma.pendingAction.findUniqueOrThrow({ where: { id: initiated.pendingActionId } });
      expect(row.status).toBe(PendingActionStatus.expired);
      expect(await prisma.user.findUnique({ where: { username: initiated.username } })).toBeNull();
    });

    it('disable flow: initiate -> confirm -> status disabled AND every refresh session of the target is revoked', async () => {
      const d = await directorWithSession();
      const hos = await seedUser(prisma, { role: UserRole.head_of_sales });
      const target = await seedUser(prisma, { role: UserRole.sales_manager, createdById: hos.id });

      const targetSessionA = await login(app, target.username);
      const targetSessionB = await login(app, target.username);
      const hosSession = await login(app, hos.username);

      const init = await http().post(`${API}/confirmations/users/${target.id}/disable`).set(...bearer(hosSession));
      expect(init.status).toBe(202);
      const [message] = await waitForMessages(init.body.pendingActionId);

      // Nothing happens before approval.
      await http().get(`${API}/auth/me`).set(...bearer(targetSessionA)).expect(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(UserStatus.active);

      const res = await http()
        .post(`${API}/confirmations/${init.body.pendingActionId}/confirm`)
        .set(...bearer(d.session))
        .send({ code: extractCode(message.Text) });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: target.id, status: UserStatus.disabled });

      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(UserStatus.disabled);
      const tokens = await prisma.refreshToken.findMany({ where: { userId: target.id } });
      expect(tokens).toHaveLength(2);
      expect(tokens.every((t) => t.revokedAt !== null && t.revokedReason === 'account_disabled')).toBe(true);

      for (const session of [targetSessionA, targetSessionB]) {
        expect((await refreshWith(app, session)).status).toBe(401);
        expect((await http().get(`${API}/auth/me`).set(...bearer(session))).status).toBe(401);
      }
      const relogin = await http().post(`${API}/auth/login`).send({ username: target.username, password: PASSWORD });
      expect(relogin.status).toBe(401);
      expect(relogin.body.message).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('disable initiated by an unrelated non-Director -> 403 immediately, no PendingAction', async () => {
      const target = await seedUser(prisma, { role: UserRole.sales_manager });
      const stranger = await seedUser(prisma, { role: UserRole.head_of_sales });
      const session = await login(app, stranger.username);

      const res = await http().post(`${API}/confirmations/users/${target.id}/disable`).set(...bearer(session));
      expect(res.status).toBe(403);
      expect(await prisma.pendingAction.count()).toBe(0);
    });
  });

  // ===================================================================
  // Consent
  // ===================================================================
  describe('Consent', () => {
    it('POST /consents persists a versioned record; GET /consents/me returns only the caller\'s records', async () => {
      const user = await seedUser(prisma, { role: UserRole.investor });
      const other = await seedUser(prisma, { role: UserRole.investor });
      const session = await login(app, user.username);
      const otherSession = await login(app, other.username);

      await http().post(`${API}/consents`).send({ policyType: 'privacy_policy', policyVersion: '1.0' }).expect(401);

      const privacyVersion = LEGAL_DOCUMENTS.privacy_policy.version;
      const outdated = await http()
        .post(`${API}/consents`)
        .set(...bearer(session))
        .send({ policyType: 'privacy_policy', policyVersion: '2020-01-01' });
      expect(outdated.status).toBe(409);
      expect(outdated.body.message).toBe('CONSENT_VERSION_NOT_CURRENT');

      const created = await http()
        .post(`${API}/consents`)
        .set(...bearer(session))
        .set('User-Agent', 'real-db-test')
        .send({ policyType: 'privacy_policy', policyVersion: privacyVersion });
      expect(created.status).toBe(201);
      await http()
        .post(`${API}/consents`)
        .set(...bearer(otherSession))
        .send({ policyType: 'terms_of_use', policyVersion: LEGAL_DOCUMENTS.terms_of_use.version })
        .expect(201);
      await http().post(`${API}/consents`).set(...bearer(session)).send({ policyType: 'nope', policyVersion: '1' }).expect(400);

      const row = await prisma.consentRecord.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row).toMatchObject({ userId: user.id, policyType: 'privacy_policy', policyVersion: privacyVersion, userAgent: 'real-db-test' });

      const mine = await http().get(`${API}/consents/me`).set(...bearer(session));
      expect(mine.status).toBe(200);
      // 3 required consents seeded for the test user + the one recorded here.
      expect(mine.body).toHaveLength(4);
      expect(mine.body.every((c: { userId: string }) => c.userId === user.id)).toBe(true);
      expect(mine.body[0]).toMatchObject({ id: created.body.id });
    });
  });

  // ===================================================================
  // Audit redaction across a full flow
  // ===================================================================
  it('audit log never contains passwords, password hashes, refresh tokens or confirmation codes', async () => {
    const d = await directorWithSession();
    const { pendingActionId, code, username } = await initiateCreate(d.session, UserRole.accountant);
    await http().post(`${API}/confirmations/${pendingActionId}/confirm`).set(...bearer(d.session)).send({ code: 'ZZZZZZZZ' });
    await http().post(`${API}/confirmations/${pendingActionId}/confirm`).set(...bearer(d.session)).send({ code }).expect(201);
    const newUser = await login(app, username);
    await refreshWith(app, newUser).expect(201);

    const secrets = [PASSWORD, code, d.session.refreshToken, newUser.refreshToken, newUser.accessToken];
    const users = await prisma.user.findMany();
    secrets.push(...users.map((u) => u.passwordHash));

    const auditText = JSON.stringify(await prisma.auditEvent.findMany());
    expect(auditText.length).toBeGreaterThan(100);
    for (const secret of secrets) expect(auditText).not.toContain(secret);
  });
});

// =====================================================================
// Rate limiting with the real throttler storage (fresh app per test)
// =====================================================================
describe('Rate limiting (real throttler) — real PostgreSQL', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('POST /auth/login is limited by AUTH_THROTTLE_LIMIT (5/min in tests) -> 429', async () => {
    const app = await createApp({ realThrottling: true });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await request(app.getHttpServer()).post(`${API}/auth/login`).send({ username: 'ghost', password: 'wrong-password' });
        statuses.push(res.status);
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);

      // /auth/refresh has its own auth-throttle bucket.
      const refreshStatuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await request(app.getHttpServer())
          .post(`${API}/auth/refresh`)
          .set('Cookie', 'uzz_refresh=bogus; uzz_csrf=x')
          .set('x-csrf-token', 'x');
        refreshStatuses.push(res.status);
      }
      expect(refreshStatuses).toEqual([401, 401, 401, 401, 401, 429]);
    } finally {
      await app.close();
    }
  });

  it('routes without @AuthThrottle() keep only the global limit (GET /auth/me is not capped at 5)', async () => {
    const app = await createApp({ realThrottling: true });
    try {
      const user = await seedUser(prisma, { role: UserRole.accountant });
      const session = await login(app, user.username);
      for (let i = 0; i < 8; i++) {
        await request(app.getHttpServer()).get(`${API}/auth/me`).set(...bearer(session)).expect(200);
      }
    } finally {
      await app.close();
    }
  });

  it('POST /confirmations/:id/confirm is limited to 5/min -> 429 on the 6th attempt', async () => {
    const app = await createApp({ realThrottling: true });
    try {
      const director = await seedUser(prisma, { role: UserRole.director });
      const session = await login(app, director.username);
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await request(app.getHttpServer())
          .post(`${API}/confirmations/00000000-0000-4000-8000-000000000000/confirm`)
          .set(...bearer(session))
          .send({ code: 'ZZZZZZZZ' });
        statuses.push(res.status);
      }
      expect(statuses).toEqual([404, 404, 404, 404, 404, 429]);
    } finally {
      await app.close();
    }
  });
});
