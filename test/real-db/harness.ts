import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient, User, UserRole, UserStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import request, { Response } from 'supertest';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app.module';
import { AppConfigService } from '../../src/config/app-config.service';
import { EncryptionService } from '../../src/crypto/encryption.service';
import { FieldCipher } from '../../src/crypto/field-cipher.service';
import { LEGAL_DOCUMENTS } from '../../src/legal/legal-documents';
import { configureApp } from '../../src/app.setup';
import { assertConnectedToTestDatabase } from './guard';
import { extractCode, waitForMessages } from './mailpit';

export const API = '/api/v1';
export const PASSWORD = 'Correct-Horse-Battery-9';

/**
 * By default rate limiting is neutralised (every request in the suite comes
 * from 127.0.0.1 and would otherwise trip the 5/min confirm limit). The
 * dedicated rate-limit tests pass `realThrottling: true`.
 */
export async function createApp(opts: { realThrottling?: boolean } = {}): Promise<INestApplication> {
  assertConnectedToTestDatabase();
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (!opts.realThrottling) {
    builder = builder.overrideProvider(ThrottlerStorage).useValue({
      increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
    });
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  configureApp(app);
  await app.init();
  return app;
}

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  assertConnectedToTestDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "EmailCode", "AuditEvent", "ConsentRecord", "PendingAction", "RefreshToken", "DailyReport", "Transaction", ' +
      '"AccountingPeriod", "PayrollEntry", "PayrollSettings", "DayOff", "Shift", "Contract", "Booking", "StoredFile", "User" ' +
      'RESTART IDENTITY CASCADE',
  );
}

/** Per-run unique suffix so Mailpit searches never match other runs. */
export function uniq(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

let passwordHashCache: string | undefined;
let cipherCache: FieldCipher | undefined;

/** The same FieldCipher the app uses (keys from .env / process.env). */
export function testCipher(): FieldCipher {
  if (!cipherCache) {
    const config = new AppConfigService(new ConfigService());
    cipherCache = new FieldCipher(new EncryptionService(config));
  }
  return cipherCache;
}

export const REQUIRED_CONSENTS = ['privacy_policy', 'terms_of_use', 'personal_data_processing'] as const;

export async function acceptRequiredConsents(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.consentRecord.createMany({
    data: REQUIRED_CONSENTS.map((policyType) => ({
      userId,
      policyType,
      policyVersion: LEGAL_DOCUMENTS[policyType].version,
    })),
  });
}

export async function seedUser(
  prisma: PrismaClient,
  data: {
    role: UserRole;
    status?: UserStatus;
    email?: string | null;
    createdById?: string;
    teamLeadId?: string;
    username?: string;
    fullName?: string;
    /** Default true: the user has accepted the current legal documents. */
    consented?: boolean;
    createdAt?: Date;
  },
): Promise<User> {
  passwordHashCache ??= await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const cipher = testCipher();
  const username = data.username ?? uniq(data.role);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: passwordHashCache,
      fullName: cipher.encrypt('User.fullName', data.fullName ?? `Test ${data.role}`),
      role: data.role,
      status: data.status ?? UserStatus.active,
      // Default: a unique address, since every login needs an emailed code.
      // Pass `email: null` explicitly for an account without email.
      email:
        data.email === null
          ? null
          : cipher.encrypt('User.email', data.email ?? `${username.toLowerCase()}@users.test`),
      createdById: data.createdById,
      teamLeadId: data.teamLeadId,
      createdAt: data.createdAt,
    },
  });
  if (data.consented !== false) await acceptRequiredConsents(prisma, user.id);
  return user;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  /** Cookie header value carrying both cookies, as a browser would send it. */
  cookieHeader: string;
}

export function cookiesFrom(res: Response): Record<string, { value: string; raw: string }> {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const out: Record<string, { value: string; raw: string }> = {};
  for (const raw of header ?? []) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    out[pair.slice(0, idx)] = { value: decodeURIComponent(pair.slice(idx + 1)), raw };
  }
  return out;
}

export function sessionFrom(res: Response): Session {
  const cookies = cookiesFrom(res);
  const refreshToken = cookies.uzz_refresh?.value;
  const csrfToken = cookies.uzz_csrf?.value;
  if (!refreshToken || !csrfToken) throw new Error(`session cookies missing (status ${res.status})`);
  return {
    accessToken: res.body.accessToken,
    refreshToken,
    csrfToken,
    cookieHeader: `uzz_refresh=${refreshToken}; uzz_csrf=${csrfToken}`,
  };
}

/** Reads the code for `challengeId` from Mailpit (the email body contains the id). */
export async function codeFromMail(challengeId: string): Promise<string> {
  const [message] = await waitForMessages(challengeId);
  return extractCode(message.Text);
}

/** Step 1 only: password check, code emailed. */
export function startLogin(app: INestApplication, username: string, password = PASSWORD) {
  return request(app.getHttpServer()).post(`${API}/auth/login`).send({ username, password });
}

/** Full login: password -> emailed code (Mailpit) -> session. */
export async function login(app: INestApplication, username: string, password = PASSWORD): Promise<Session> {
  const res = await loginResponse(app, username, password);
  return sessionFrom(res);
}

export async function loginResponse(app: INestApplication, username: string, password = PASSWORD): Promise<Response> {
  const first = await startLogin(app, username, password);
  if (first.status !== 201 || !first.body.challengeId) {
    throw new Error(`login step 1 failed for ${username}: ${first.status} ${JSON.stringify(first.body)}`);
  }
  const code = await codeFromMail(first.body.challengeId);
  const res = await request(app.getHttpServer())
    .post(`${API}/auth/login/verify`)
    .send({ challengeId: first.body.challengeId, code });
  if (res.status !== 201) throw new Error(`login step 2 failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  return res;
}

/**
 * Requests a step-up code for `action` as the session user and returns the
 * headers to attach to the protected request.
 */
export async function actionCodeHeaders(
  app: INestApplication,
  session: Pick<Session, 'accessToken'>,
  action: string,
  resourceId?: string,
): Promise<Record<string, string>> {
  const res = await request(app.getHttpServer())
    .post(`${API}/email-codes`)
    .set(...bearer(session))
    .send(resourceId ? { action, resourceId } : { action });
  if (res.status !== 201) throw new Error(`email code request failed: ${res.status} ${JSON.stringify(res.body)}`);
  const code = await codeFromMail(res.body.challengeId);
  return { 'x-confirmation-id': res.body.challengeId, 'x-confirmation-code': code };
}

export function refreshWith(app: INestApplication, session: Pick<Session, 'refreshToken' | 'csrfToken'>) {
  return request(app.getHttpServer())
    .post(`${API}/auth/refresh`)
    .set('Cookie', `uzz_refresh=${session.refreshToken}; uzz_csrf=${session.csrfToken}`)
    .set('x-csrf-token', session.csrfToken);
}

export function bearer(session: Pick<Session, 'accessToken'>): [string, string] {
  return ['Authorization', `Bearer ${session.accessToken}`];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
