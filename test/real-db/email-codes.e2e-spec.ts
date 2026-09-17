/**
 * Emailed codes (login factor, step-up for important actions, email and
 * password change) and database backups against real PostgreSQL + real SMTP
 * (Mailpit).
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient, User, UserRole } from '@prisma/client';
import { createHash, generateKeyPairSync, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { decryptBackup } from '../../src/backups/backup-crypto';
import { parseSnapshot, restoreSnapshot } from '../../src/backups/backup-snapshot';
import { BusinessCalendar } from '../../src/common/business-calendar.service';
import { LEGAL_DOCUMENTS } from '../../src/legal/legal-documents';
import { assertConnectedToTestDatabase } from './guard';
import {
  API,
  PASSWORD,
  Session,
  actionCodeHeaders,
  bearer,
  codeFromMail,
  createApp,
  login,
  loginResponse,
  seedUser,
  startLogin,
  truncateAll,
} from './harness';
import { waitForMessages } from './mailpit';

assertConnectedToTestDatabase();

const BUYER_CONSENT = { buyerConsentConfirmed: true, buyerConsentVersion: LEGAL_DOCUMENTS.buyer_personal_data_consent.version };
const FAKE_ID = '3f1b2c4d-1111-4222-8333-444455556666';

describe('Email codes and backups — real PostgreSQL + Mailpit', () => {
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

  async function booking(session: Session): Promise<string> {
    const res = await http()
      .post(`${API}/bookings`)
      .set(...bearer(session))
      .send({ fullName: 'Асанов Бакыт', passportNumber: 'ID 7654321', phone: '+996555000111', desiredAreaSqm: '50', ...BUYER_CONSENT });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  describe('Login', () => {
    it('password alone gives no session; the code emailed to the user does; replay fails', async () => {
      const user = await seedUser(prisma, { role: UserRole.sales_manager });
      const first = await startLogin(app, user.username);
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ mfaRequired: true });
      expect(first.body.accessToken).toBeUndefined();
      expect(first.headers['set-cookie']).toBeUndefined();
      expect(first.body.emailHint).toMatch(/\*\*\*@users\.test$/);

      const [mail] = await waitForMessages(first.body.challengeId);
      expect(mail.To.map((t) => t.Address)).toEqual([`${user.username.toLowerCase()}@users.test`]);
      const code = await codeFromMail(first.body.challengeId);

      const row = await prisma.emailCode.findUniqueOrThrow({ where: { id: first.body.challengeId } });
      expect(row.codeHash).not.toContain(code);
      expect(JSON.stringify(await prisma.auditEvent.findMany())).not.toContain(code);

      const wrong = await http().post(`${API}/auth/login/verify`).send({ challengeId: first.body.challengeId, code: 'AAAAAAAA' });
      expect(wrong.status).toBe(401);
      expect(wrong.body.message).toBe('EMAIL_CODE_INVALID');

      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
      const ok = await http().post(`${API}/auth/login/verify`).send({ challengeId: first.body.challengeId, code: code.toLowerCase() });
      expect(ok.status).toBe(201);
      expect(ok.body.accessToken).toBeTruthy();
      expect(ok.body.user.emailVerified).toBe(true);

      const replay = await http().post(`${API}/auth/login/verify`).send({ challengeId: first.body.challengeId, code });
      expect(replay.status).toBe(401);
      expect(replay.body.message).toBe('EMAIL_CODE_USED');
    });

    it('five wrong codes lock the challenge; a newer login supersedes the older code', async () => {
      const user = await seedUser(prisma, { role: UserRole.accountant });
      const first = await startLogin(app, user.username);
      const code = await codeFromMail(first.body.challengeId);
      for (let i = 0; i < 5; i++) {
        await http().post(`${API}/auth/login/verify`).send({ challengeId: first.body.challengeId, code: 'ZZZZZZZZ' });
      }
      const locked = await http().post(`${API}/auth/login/verify`).send({ challengeId: first.body.challengeId, code });
      expect(locked.status).toBe(401);
      expect(locked.body.message).toBe('EMAIL_CODE_LOCKED');

      const second = await startLogin(app, user.username);
      const secondCode = await codeFromMail(second.body.challengeId);
      const third = await startLogin(app, user.username);
      const superseded = await http().post(`${API}/auth/login/verify`).send({ challengeId: second.body.challengeId, code: secondCode });
      expect(superseded.body.message).toBe('EMAIL_CODE_USED');
      await http()
        .post(`${API}/auth/login/verify`)
        .send({ challengeId: third.body.challengeId, code: await codeFromMail(third.body.challengeId) })
        .expect(201);
    });

    it('wrong password sends nothing; an account without email cannot sign in', async () => {
      const user = await seedUser(prisma, { role: UserRole.director });
      const bad = await startLogin(app, user.username, 'wrong-password-1');
      expect(bad.status).toBe(401);
      expect(bad.body.message).toBe('AUTH_INVALID_CREDENTIALS');
      expect(await prisma.emailCode.count()).toBe(0);

      const noEmail = await seedUser(prisma, { role: UserRole.director, email: null });
      const res = await startLogin(app, noEmail.username);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('AUTH_EMAIL_NOT_CONFIGURED');
    });

    it('failed email delivery does not use up the code limit (no lockout during a mail outage)', async () => {
      const user = await seedUser(prisma, { role: UserRole.director });
      process.env.EMAIL_CODE_MAX_PER_15_MIN = '3';
      process.env.EMAIL_TRANSPORT = 'brevo';
      const key = process.env.BREVO_API_KEY;
      delete process.env.BREVO_API_KEY; // every send fails
      try {
        for (let i = 0; i < 5; i++) {
          const res = await startLogin(app, user.username);
          expect({ i, status: res.status, message: res.body.message }).toEqual({ i, status: 503, message: 'EMAIL_DELIVERY_FAILED' });
        }
        expect(await prisma.emailCode.count({ where: { userId: user.id } })).toBe(0);
        expect(await prisma.auditEvent.count({ where: { action: 'EMAIL_CODE_DELIVERY_FAILED', actorUserId: user.id } })).toBe(5);
      } finally {
        process.env.EMAIL_TRANSPORT = 'smtp';
        if (key) process.env.BREVO_API_KEY = key;
      }
      // Mail is back: login works immediately, and the limit still applies to delivered codes.
      await loginResponse(app, user.username);
      await startLogin(app, user.username);
      await startLogin(app, user.username);
      const limited = await startLogin(app, user.username);
      expect(limited.status).toBe(429);
      process.env.EMAIL_CODE_MAX_PER_15_MIN = '1000';
    });

    it('a disabled account gets the generic error at step 2 as well', async () => {
      const user = await seedUser(prisma, { role: UserRole.sales_manager });
      const first = await startLogin(app, user.username);
      const code = await codeFromMail(first.body.challengeId);
      await prisma.user.update({ where: { id: user.id }, data: { status: 'disabled' } });
      const res = await http().post(`${API}/auth/login/verify`).send({ challengeId: first.body.challengeId, code });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('AUTH_INVALID_CREDENTIALS');
    });
  });

  describe('Step-up codes for important actions', () => {
    let director: User, manager: User, accountant: User, hos: User;
    let s: Record<'director' | 'manager' | 'accountant' | 'hos', Session>;

    beforeEach(async () => {
      director = await seedUser(prisma, { role: UserRole.director });
      hos = await seedUser(prisma, { role: UserRole.head_of_sales });
      manager = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id, createdById: hos.id });
      accountant = await seedUser(prisma, { role: UserRole.accountant });
      s = {
        director: await login(app, director.username),
        hos: await login(app, hos.username),
        manager: await login(app, manager.username),
        accountant: await login(app, accountant.username),
      };
    });

    it('every protected route refuses without a code (403 EMAIL_CODE_REQUIRED) and changes nothing', async () => {
      const cases: Array<[Session, 'post' | 'patch' | 'put' | 'delete' | 'get', string]> = [
        [s.director, 'delete', `/bookings/${FAKE_ID}`],
        [s.director, 'delete', `/contracts/${FAKE_ID}`],
        [s.manager, 'post', `/contracts/${FAKE_ID}/deposit`],
        [s.manager, 'put', `/contracts/${FAKE_ID}/file`],
        [s.director, 'patch', `/shifts/${FAKE_ID}`],
        [s.director, 'delete', `/shifts/${FAKE_ID}`],
        [s.director, 'delete', `/day-offs/${FAKE_ID}`],
        [s.accountant, 'put', '/payroll/settings'],
        [s.accountant, 'post', `/payroll/entries/${FAKE_ID}/confirm`],
        [s.director, 'delete', `/payroll/entries/${FAKE_ID}`],
        [s.accountant, 'post', '/transactions'],
        [s.accountant, 'patch', `/transactions/${FAKE_ID}`],
        [s.director, 'delete', `/transactions/${FAKE_ID}`],
        [s.accountant, 'put', `/transactions/${FAKE_ID}/attachment`],
        [s.accountant, 'post', '/accounting/periods/2020-01/close'],
        [s.manager, 'post', '/users/me/email'],
        [s.manager, 'post', '/users/me/password'],
        [s.director, 'get', '/backups/export'],
      ];
      for (const [session, method, path] of cases) {
        const res = await http()[method](`${API}${path}`).set(...bearer(session)).send({});
        expect({ path, status: res.status, message: res.body.message }).toEqual({ path, status: 403, message: 'EMAIL_CODE_REQUIRED' });
      }
    });

    it('RBAC runs first: a forbidden role gets 403 AUTH_FORBIDDEN and no code is consumed', async () => {
      const id = await booking(s.manager);
      const headers = await actionCodeHeaders(app, s.manager, 'booking.delete', id);
      const res = await http().delete(`${API}/bookings/${id}`).set(...bearer(s.manager)).set(headers);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('AUTH_FORBIDDEN');
      expect((await prisma.emailCode.findUniqueOrThrow({ where: { id: headers['x-confirmation-id'] } })).consumedAt).toBeNull();
    });

    it('a code works once, only for its user, action and record', async () => {
      const a = await booking(s.manager);
      const b = await booking(s.manager);
      const headers = await actionCodeHeaders(app, s.director, 'booking.delete', a);

      // Another record, another user, another action: all rejected.
      expect((await http().delete(`${API}/bookings/${b}`).set(...bearer(s.director)).set(headers)).body.message).toBe('EMAIL_CODE_INVALID');
      expect((await http().delete(`${API}/bookings/${a}`).set(...bearer(s.hos)).set(headers)).body.message).toBe('EMAIL_CODE_INVALID');
      expect((await http().delete(`${API}/contracts/${a}`).set(...bearer(s.director)).set(headers)).body.message).toBe('EMAIL_CODE_INVALID');
      expect(await prisma.booking.count()).toBe(2);

      const wrongCode = { ...headers, 'x-confirmation-code': 'AAAAAAAA' };
      expect((await http().delete(`${API}/bookings/${a}`).set(...bearer(s.director)).set(wrongCode)).status).toBe(401);

      await http().delete(`${API}/bookings/${a}`).set(...bearer(s.director)).set(headers).expect(204);
      expect(await prisma.booking.findUnique({ where: { id: a } })).toBeNull();

      const replay = await http().delete(`${API}/bookings/${b}`).set(...bearer(s.director)).set(headers);
      expect(replay.status).toBe(401);
      expect(await prisma.booking.count()).toBe(1);
    });

    it('a request rejected by validation gives the code back; the fixed request then succeeds', async () => {
      const calendar = app.get(BusinessCalendar);
      const headers = await actionCodeHeaders(app, s.accountant, 'transaction.create');
      const invalid = await http().post(`${API}/transactions`).set(...bearer(s.accountant)).set(headers).send({ type: 'expense' });
      expect(invalid.status).toBe(400);
      const ok = await http()
        .post(`${API}/transactions`)
        .set(...bearer(s.accountant))
        .set(headers)
        .send({ type: 'expense', category: 'utilities', amountTyiyn: '100', date: calendar.today() });
      expect(ok.status).toBe(201);
      const again = await http()
        .post(`${API}/transactions`)
        .set(...bearer(s.accountant))
        .set(headers)
        .send({ type: 'expense', category: 'utilities', amountTyiyn: '100', date: calendar.today() });
      expect(again.status).toBe(401);
      expect(await prisma.transaction.count()).toBe(1);
    });

    it('requesting a code validates the action and its resource binding', async () => {
      const post = (body: object) => http().post(`${API}/email-codes`).set(...bearer(s.director)).send(body);
      expect((await post({ action: 'drop.database' })).status).toBe(400);
      expect((await post({ action: 'booking.delete' })).body.message).toBe('EMAIL_CODE_RESOURCE_REQUIRED');
      expect((await post({ action: 'backup.export', resourceId: FAKE_ID })).body.message).toBe('EMAIL_CODE_RESOURCE_NOT_ALLOWED');
      expect((await http().post(`${API}/email-codes`).send({ action: 'backup.export' })).status).toBe(401);
    });
  });

  describe('Email and password change', () => {
    it('email change needs a code at the current address and one at the new address', async () => {
      const user = await seedUser(prisma, { role: UserRole.sales_manager });
      const other = await seedUser(prisma, { role: UserRole.sales_manager });
      const session = await login(app, user.username);
      const oldAddress = `${user.username.toLowerCase()}@users.test`;
      const newAddress = `new-${randomBytes(3).toString('hex')}@users.test`;

      // PATCH /users/me can no longer change the email.
      expect((await http().patch(`${API}/users/me`).set(...bearer(session)).send({ email: newAddress })).status).toBe(400);

      const taken = await http()
        .post(`${API}/users/me/email`)
        .set(...bearer(session))
        .set(await actionCodeHeaders(app, session, 'user.email.change'))
        .send({ email: `${other.username.toLowerCase()}@users.test` });
      expect(taken.status).toBe(409);
      expect(taken.body.message).toBe('EMAIL_TAKEN');

      const started = await http()
        .post(`${API}/users/me/email`)
        .set(...bearer(session))
        .set(await actionCodeHeaders(app, session, 'user.email.change'))
        .send({ email: newAddress });
      expect(started.status).toBe(201);
      const [mail] = await waitForMessages(started.body.challengeId);
      expect(mail.To.map((t) => t.Address)).toEqual([newAddress]);

      const confirmed = await http()
        .post(`${API}/users/me/email/confirm`)
        .set(...bearer(session))
        .send({ challengeId: started.body.challengeId, code: await codeFromMail(started.body.challengeId) });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body).toMatchObject({ email: newAddress, emailVerified: true });

      const notices = await waitForMessages('Email вашего аккаунта CRM');
      expect(notices.some((m) => m.To.some((t) => t.Address === oldAddress))).toBe(true);

      // The next login code goes to the new address.
      const next = await startLogin(app, user.username);
      const [loginMail] = await waitForMessages(next.body.challengeId);
      expect(loginMail.To.map((t) => t.Address)).toEqual([newAddress]);
    });

    it('password change needs the current password and a code, and ends every session', async () => {
      const user = await seedUser(prisma, { role: UserRole.accountant });
      const session = await login(app, user.username);
      const other = await login(app, user.username);

      const wrongCurrent = await http()
        .post(`${API}/users/me/password`)
        .set(...bearer(session))
        .set(await actionCodeHeaders(app, session, 'user.password.change'))
        .send({ currentPassword: 'not-my-password', newPassword: 'Brand-New-Password-42' });
      expect(wrongCurrent.status).toBe(401);

      await http()
        .post(`${API}/users/me/password`)
        .set(...bearer(session))
        .set(await actionCodeHeaders(app, session, 'user.password.change'))
        .send({ currentPassword: PASSWORD, newPassword: 'Brand-New-Password-42' })
        .expect(204);

      expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
      const refresh = await http()
        .post(`${API}/auth/refresh`)
        .set('Cookie', other.cookieHeader)
        .set('x-csrf-token', other.csrfToken);
      expect(refresh.status).toBe(401);
      expect((await startLogin(app, user.username)).status).toBe(401);
      await loginResponse(app, user.username, 'Brand-New-Password-42');
    });
  });

  describe('Backups', () => {
    const passphrase = 'test-backup-passphrase-123';
    const keys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase },
    });
    const agentToken = randomBytes(32).toString('base64url');

    afterEach(() => {
      delete process.env.BACKUP_PUBLIC_KEY;
      delete process.env.BACKUP_AGENT_TOKEN_SHA256;
    });

    const binary = (req: request.Test) =>
      req.buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    it('not configured: director gets 503, agent endpoint does not exist', async () => {
      const director = await seedUser(prisma, { role: UserRole.director });
      const session = await login(app, director.username);
      const res = await http().get(`${API}/backups/export`).set(...bearer(session)).set(await actionCodeHeaders(app, session, 'backup.export'));
      expect(res.status).toBe(503);
      expect(res.body.message).toBe('BACKUP_NOT_CONFIGURED');
      expect((await http().get(`${API}/backups/agent/export`)).status).toBe(404);
    });

    it('director export decrypts only with the private key and restores into an empty database', async () => {
      process.env.BACKUP_PUBLIC_KEY = Buffer.from(keys.publicKey).toString('base64');
      const director = await seedUser(prisma, { role: UserRole.director });
      const hos = await seedUser(prisma, { role: UserRole.head_of_sales });
      const manager = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id, createdById: hos.id });
      const session = await login(app, director.username);
      const bookingId = await booking(await login(app, manager.username));

      expect((await http().get(`${API}/backups/export`).set(...bearer(await login(app, hos.username)))).status).toBe(403);

      const res = await binary(
        http().get(`${API}/backups/export`).set(...bearer(session)).set(await actionCodeHeaders(app, session, 'backup.export')),
      );
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="uzz-crm-backup-.*\.uzzbak"/);
      const file = res.body as Buffer;
      expect(file.includes(Buffer.from('Асанов'))).toBe(false);
      expect(() => decryptBackup(file, keys.privateKey, 'wrong-passphrase-000')).toThrow();

      const snapshot = parseSnapshot(decryptBackup(file, keys.privateKey, passphrase).plaintext);
      expect(snapshot.meta.counts).toMatchObject({ User: 3, Booking: 1 });
      expect(snapshot.keys.ENCRYPTION_KEY_V1).toBe(process.env.ENCRYPTION_KEY_V1);
      expect(JSON.stringify(snapshot.tables)).not.toContain('Асанов'); // PII stays field-encrypted inside

      const status = await http().get(`${API}/backups/status`).set(...bearer(session));
      expect(status.body).toMatchObject({ configured: true, lastExportChannel: 'director' });

      // Disaster: the database is wiped. Restore and read the data through the API.
      await truncateAll(prisma);
      await expect(restoreSnapshot(prisma, snapshot, { storageDir: join(tmpdir(), `uzz-restore-${process.pid}`) })).resolves.toMatchObject({
        User: 3,
        Booking: 1,
      });
      await expect(restoreSnapshot(prisma, snapshot, { storageDir: tmpdir() })).rejects.toThrow('not empty');

      const restoredManager = await prisma.user.findUniqueOrThrow({ where: { id: manager.id } });
      expect(restoredManager.teamLeadId).toBe(hos.id);
      const afterRestore = await login(app, director.username);
      const detail = await http().get(`${API}/bookings/${bookingId}`).set(...bearer(afterRestore));
      expect(detail.status).toBe(200);
      expect(detail.body.fullName).toBe('Асанов Бакыт');
    });

    it('agent endpoint: token required, compared by hash, audited', async () => {
      process.env.BACKUP_PUBLIC_KEY = keys.publicKey;
      process.env.BACKUP_AGENT_TOKEN_SHA256 = createHash('sha256').update(agentToken).digest('hex');
      await seedUser(prisma, { role: UserRole.director });

      expect((await http().get(`${API}/backups/agent/export`)).status).toBe(401);
      expect((await http().get(`${API}/backups/agent/export`).set('Authorization', 'Bearer wrong-token')).status).toBe(401);
      const ok = await binary(http().get(`${API}/backups/agent/export`).set('Authorization', `Bearer ${agentToken}`));
      expect(ok.status).toBe(200);
      expect(parseSnapshot(decryptBackup(ok.body, keys.privateKey, passphrase).plaintext).meta.counts.User).toBe(1);

      const audit = await prisma.auditEvent.findMany({ where: { entityType: 'Backup' }, orderBy: { createdAt: 'asc' } });
      expect(audit.map((a) => a.action)).toEqual(['BACKUP_AGENT_AUTH_FAILED', 'BACKUP_AGENT_AUTH_FAILED', 'BACKUP_EXPORTED']);
      expect(JSON.stringify(audit)).not.toContain(agentToken);
      await fs.rm(join(tmpdir(), `uzz-restore-${process.pid}`), { recursive: true, force: true });
    });
  });
});
