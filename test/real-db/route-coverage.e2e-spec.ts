/**
 * Покрытие маршрутов: каждый маршрут, опубликованный в Swagger, вызывается
 * здесь по-настоящему — реальная PostgreSQL, реальные письма через Mailpit,
 * настоящая сессия роли, которой этот маршрут разрешён, и настоящие коды
 * подтверждения для защищённых действий.
 *
 * Последний тест сверяет список вызванных маршрутов с документом OpenAPI и
 * падает, если в API появился маршрут, который ничто не вызывает. Так новый
 * эндпоинт не уедет на сервер непроверенным.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHash, generateKeyPairSync, randomBytes } from 'crypto';
import request from 'supertest';
import { buildOpenApiDocument } from '../../src/app.setup';
import { LEGAL_DOCUMENTS } from '../../src/legal/legal-documents';
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
  refreshWith,
  seedUser,
  sessionFrom,
  startLogin,
  truncateAll,
  uniq,
} from './harness';

const BUYER_CONSENT = {
  buyerConsentConfirmed: true,
  buyerConsentVersion: LEGAL_DOCUMENTS.buyer_personal_data_consent.version,
};
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a70000000049454e44ae426082',
  'hex',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

/** Даты считаются в UTC: Бишкек это UTC+6, поэтому «сегодня» по UTC никогда не в будущем. */
const isoDay = (offsetDays = 0): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const previousPeriod = (): string => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const dayInPreviousPeriod = (): string => `${previousPeriod()}-15`;

describe('Покрытие маршрутов Swagger — реальная PostgreSQL + Mailpit', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const covered = new Set<string>();
  const http = () => request(app.getHttpServer());

  /** Выполняет запрос, отмечает маршрут покрытым и проверяет статус ответа. */
  async function call(route: string, req: request.Test, expected: number | number[]): Promise<request.Response> {
    const res = await req;
    covered.add(route);
    const want = Array.isArray(expected) ? expected : [expected];
    if (!want.includes(res.status)) {
      throw new Error(`${route}: ожидался статус ${want.join(' или ')}, получен ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res;
  }

  /** Скачивание файла: тело нужно как Buffer, а не как разобранный JSON. */
  const binary = (req: request.Test) =>
    req.buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  const backupKeys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const agentToken = randomBytes(32).toString('base64url');

  let director: { id: string; username: string };
  let hos: { id: string; username: string };
  let manager: { id: string; username: string };
  let accountant: { id: string; username: string };
  let investor: { id: string; username: string };
  let reception: { id: string; username: string };
  let s: Record<'director' | 'hos' | 'manager' | 'accountant' | 'investor' | 'reception', Session>;

  // Данные, которые создаются в одном блоке и используются в следующих.
  let contractId: string;
  let shiftId: string;
  let dayOffId: string;

  beforeAll(async () => {
    process.env.BACKUP_PUBLIC_KEY = Buffer.from(backupKeys.publicKey).toString('base64');
    process.env.BACKUP_AGENT_TOKEN_SHA256 = createHash('sha256').update(agentToken).digest('hex');

    app = await createApp();
    prisma = new PrismaClient();
    await truncateAll(prisma);

    director = await seedUser(prisma, { role: UserRole.director });
    hos = await seedUser(prisma, { role: UserRole.head_of_sales, createdById: director.id });
    manager = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id, createdById: hos.id });
    accountant = await seedUser(prisma, { role: UserRole.accountant, createdById: director.id });
    investor = await seedUser(prisma, { role: UserRole.investor, createdById: director.id });
    reception = await seedUser(prisma, { role: UserRole.reception, createdById: director.id });

    s = {
      director: await login(app, director.username),
      hos: await login(app, hos.username),
      manager: await login(app, manager.username),
      accountant: await login(app, accountant.username),
      investor: await login(app, investor.username),
      reception: await login(app, reception.username),
    };
  }, 120_000);

  afterAll(async () => {
    delete process.env.BACKUP_PUBLIC_KEY;
    delete process.env.BACKUP_AGENT_TOKEN_SHA256;
    await prisma?.$disconnect();
    await app?.close();
  });

  it('здоровье сервиса, вход, обновление сессии и выход', async () => {
    await call('GET /health', http().get(`${API}/health`), 200);

    const fresh = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id, createdById: hos.id });
    const step1 = await call('POST /auth/login', startLogin(app, fresh.username), 201);
    const code = await codeFromMail(step1.body.challengeId);
    const step2 = await call(
      'POST /auth/login/verify',
      http().post(`${API}/auth/login/verify`).send({ challengeId: step1.body.challengeId, code }),
      201,
    );
    const session = sessionFrom(step2);

    await call('GET /auth/me', http().get(`${API}/auth/me`).set(...bearer(session)), 200);
    await call('POST /auth/refresh', refreshWith(app, session), [200, 201]);

    // Выход отдельной сессией, чтобы не рвать сессии, нужные дальше.
    const throwaway = sessionFrom(await loginResponse(app, director.username));
    await call(
      'POST /auth/logout',
      http()
        .post(`${API}/auth/logout`)
        .set(...bearer(throwaway))
        .set('Cookie', throwaway.cookieHeader)
        .set('x-csrf-token', throwaway.csrfToken),
      [200, 201, 204],
    );
  }, 60_000);

  it('согласия и юридические документы', async () => {
    await call('GET /consents/status', http().get(`${API}/consents/status`).set(...bearer(s.director)), 200);
    await call('GET /consents/me', http().get(`${API}/consents/me`).set(...bearer(s.director)), 200);
    await call('GET /legal/documents', http().get(`${API}/legal/documents`).set(...bearer(s.director)), 200);
    await call(
      'GET /legal/documents/{type}',
      http().get(`${API}/legal/documents/privacy_policy`).set(...bearer(s.director)),
      200,
    );

    // Принятие согласий проверяется на пользователе, который их ещё не давал.
    const pending = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id, consented: false });
    const pendingSession = await login(app, pending.username);
    await call(
      'POST /consents',
      http()
        .post(`${API}/consents`)
        .set(...bearer(pendingSession))
        .send({ policyType: 'privacy_policy', policyVersion: LEGAL_DOCUMENTS.privacy_policy.version }),
      [200, 201],
    );
  }, 60_000);

  it('профиль, аватар и список сотрудников', async () => {
    await call('GET /users', http().get(`${API}/users`).set(...bearer(s.director)), 200);
    await call('GET /users/{id}', http().get(`${API}/users/${manager.id}`).set(...bearer(s.director)), 200);
    await call(
      'PATCH /users/me',
      http()
        .patch(`${API}/users/me`)
        .set(...bearer(s.director))
        .send({ phone: '+996 700 00-00-01' }),
      200,
    );
    await call(
      'PUT /users/me/avatar',
      http()
        .put(`${API}/users/me/avatar`)
        .set(...bearer(s.director))
        .attach('file', PNG, { filename: 'avatar.png', contentType: 'image/png' }),
      200,
    );
    await call(
      'GET /users/{id}/avatar',
      binary(http().get(`${API}/users/${director.id}/avatar`).set(...bearer(s.director))),
      200,
    );
    await call('DELETE /users/me/avatar', http().delete(`${API}/users/me/avatar`).set(...bearer(s.director)), 204);
  }, 60_000);

  it('создание сотрудника директором: запрос, подтверждение, отклонение, отключение', async () => {
    const body = (username: string) => ({
      username,
      password: 'Correct-Horse-Battery-9',
      fullName: 'Новый Сотрудник',
      email: `${username}@users.test`,
      role: UserRole.accountant,
    });

    const initiated = await call(
      'POST /confirmations/users',
      http()
        .post(`${API}/confirmations/users`)
        .set(...bearer(s.director))
        .send(body(uniq('created'))),
      202,
    );
    await call('GET /confirmations/pending', http().get(`${API}/confirmations/pending`).set(...bearer(s.director)), 200);
    await call(
      'POST /confirmations/{id}/confirm',
      http()
        .post(`${API}/confirmations/${initiated.body.pendingActionId}/confirm`)
        .set(...bearer(s.director))
        .send({ code: await codeFromMail(initiated.body.pendingActionId) }),
      [200, 201],
    );

    const rejected = await call(
      'POST /confirmations/users',
      http()
        .post(`${API}/confirmations/users`)
        .set(...bearer(s.director))
        .send(body(uniq('rejected'))),
      202,
    );
    await call(
      'POST /confirmations/{id}/reject',
      http()
        .post(`${API}/confirmations/${rejected.body.pendingActionId}/reject`)
        .set(...bearer(s.director)),
      [200, 201],
    );

    const target = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id, createdById: hos.id });
    await call(
      'POST /confirmations/users/{id}/disable',
      http()
        .post(`${API}/confirmations/users/${target.id}/disable`)
        .set(...bearer(s.director)),
      202,
    );
  }, 60_000);

  it('коды подтверждения, смена почты и смена пароля', async () => {
    await call(
      'POST /email-codes',
      http()
        .post(`${API}/email-codes`)
        .set(...bearer(s.director))
        .send({ action: 'payroll.settings.update' }),
      201,
    );

    // Смена почты и пароля — на отдельном сотруднике: смена пароля завершает
    // все его сессии, и это не должно ломать остальные блоки.
    const target = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id, createdById: hos.id });
    const targetSession = await login(app, target.username);
    const newEmail = `${uniq('moved')}@users.test`;

    const started = await call(
      'POST /users/me/email',
      http()
        .post(`${API}/users/me/email`)
        .set(...bearer(targetSession))
        .set(await actionCodeHeaders(app, targetSession, 'user.email.change'))
        .send({ email: newEmail }),
      [200, 201],
    );
    await call(
      'POST /users/me/email/confirm',
      http()
        .post(`${API}/users/me/email/confirm`)
        .set(...bearer(targetSession))
        .send({ challengeId: started.body.challengeId, code: await codeFromMail(started.body.challengeId) }),
      200,
    );
    await call(
      'POST /users/me/password',
      http()
        .post(`${API}/users/me/password`)
        .set(...bearer(targetSession))
        .set(await actionCodeHeaders(app, targetSession, 'user.password.change'))
        .send({ currentPassword: PASSWORD, newPassword: 'Another-Correct-Horse-1' }),
      204,
    );
  }, 90_000);

  it('брони: создание, чтение, правка, конвертация и удаление', async () => {
    const bookingBody = () => ({
      fullName: 'Асанов Бакыт',
      passportNumber: 'ID 1234567',
      phone: '+996 555 12-34-56',
      email: 'bakyt@example.com',
      desiredAreaSqm: '60',
      ...BUYER_CONSENT,
    });

    const created = await call(
      'POST /bookings',
      http()
        .post(`${API}/bookings`)
        .set(...bearer(s.manager))
        .send(bookingBody()),
      201,
    );
    await call('GET /bookings', http().get(`${API}/bookings`).set(...bearer(s.manager)), 200);
    await call('GET /bookings/{id}', http().get(`${API}/bookings/${created.body.id}`).set(...bearer(s.manager)), 200);
    await call(
      'PATCH /bookings/{id}',
      http()
        .patch(`${API}/bookings/${created.body.id}`)
        .set(...bearer(s.manager))
        .send({ desiredAreaSqm: '65' }),
      200,
    );

    const converted = await call(
      'POST /bookings/{id}/convert',
      http()
        .post(`${API}/bookings/${created.body.id}/convert`)
        .set(...bearer(s.manager))
        .send({ address: 'г. Ош, ул. Ленина 1', pricePerSqmTyiyn: '5000000', ...BUYER_CONSENT }),
      201,
    );
    contractId = converted.body.id;

    // Удаляется отдельная бронь: конвертированную удалять нельзя.
    const disposable = await http()
      .post(`${API}/bookings`)
      .set(...bearer(s.manager))
      .send(bookingBody());
    await call(
      'DELETE /bookings/{id}',
      http()
        .delete(`${API}/bookings/${disposable.body.id}`)
        .set(...bearer(s.hos))
        .set(await actionCodeHeaders(app, s.hos, 'booking.delete', disposable.body.id)),
      204,
    );
  }, 90_000);

  it('лиды: ресепшен регистрирует, начальник назначает, менеджер превращает в бронь', async () => {
    const created = await call(
      'POST /leads',
      http()
        .post(`${API}/leads`)
        .set(...bearer(s.reception))
        .send({
          firstName: 'Бакыт',
          lastName: 'Асанов',
          phone: '+996 555 77-88-99',
          desiredAreaSqm: '72.5',
          comment: 'Звонил по объявлению',
          ...BUYER_CONSENT,
        }),
      201,
    );
    const leadId = created.body.id;

    await call('GET /leads', http().get(`${API}/leads`).set(...bearer(s.hos)), 200);
    await call('GET /leads/{id}', http().get(`${API}/leads/${leadId}`).set(...bearer(s.hos)), 200);
    await call(
      'PATCH /leads/{id}/assign',
      http()
        .patch(`${API}/leads/${leadId}/assign`)
        .set(...bearer(s.hos))
        .send({ managerId: manager.id }),
      200,
    );
    const converted = await call(
      'POST /leads/{id}/convert',
      http()
        .post(`${API}/leads/${leadId}/convert`)
        .set(...bearer(s.manager))
        .send({ passportNumber: 'ID 7654321', ...BUYER_CONSENT }),
      201,
    );
    expect(converted.body.bookingId).toBeTruthy();
    expect(converted.body.lead.status).toBe('converted');

    // Отказ проверяется на отдельном обращении: превращённый лид отклонить нельзя.
    const second = await http()
      .post(`${API}/leads`)
      .set(...bearer(s.reception))
      .send({ firstName: 'Айжан', lastName: 'Кадырова', phone: '+996 700 11-22-33', desiredAreaSqm: '45', ...BUYER_CONSENT });
    await call(
      'PATCH /leads/{id}/reject',
      http().patch(`${API}/leads/${second.body.id}/reject`).set(...bearer(s.hos)),
      200,
    );
  }, 90_000);

  it('договоры: чтение, правка, взнос, файл и удаление', async () => {
    await call('GET /contracts', http().get(`${API}/contracts`).set(...bearer(s.manager)), 200);
    await call('GET /contracts/{id}', http().get(`${API}/contracts/${contractId}`).set(...bearer(s.manager)), 200);
    await call(
      'PATCH /contracts/{id}',
      http()
        .patch(`${API}/contracts/${contractId}`)
        .set(...bearer(s.manager))
        .send({ address: 'г. Ош, ул. Ленина 2' }),
      200,
    );
    await call(
      'POST /contracts/{id}/deposit',
      http()
        .post(`${API}/contracts/${contractId}/deposit`)
        .set(...bearer(s.manager))
        .set(await actionCodeHeaders(app, s.manager, 'contract.deposit', contractId))
        .send({ paid: true }),
      [200, 201],
    );
    await call(
      'PUT /contracts/{id}/file',
      http()
        .put(`${API}/contracts/${contractId}/file`)
        .set(...bearer(s.manager))
        .set(await actionCodeHeaders(app, s.manager, 'contract.file', contractId))
        .attach('file', PDF, { filename: 'contract.pdf', contentType: 'application/pdf' }),
      200,
    );
    await call(
      'GET /contracts/{id}/file',
      binary(http().get(`${API}/contracts/${contractId}/file`).set(...bearer(s.manager))),
      200,
    );

    const disposable = await call(
      'POST /contracts',
      http()
        .post(`${API}/contracts`)
        .set(...bearer(s.manager))
        .send({
          fullName: 'Кадырова Айжан',
          passportNumber: 'AN5555555',
          address: 'г. Бишкек',
          phone: '+996700000001',
          areaSqm: '45.5',
          pricePerSqmTyiyn: '4500000',
          ...BUYER_CONSENT,
        }),
      201,
    );
    await call(
      'DELETE /contracts/{id}',
      http()
        .delete(`${API}/contracts/${disposable.body.id}`)
        .set(...bearer(s.hos))
        .set(await actionCodeHeaders(app, s.hos, 'contract.delete', disposable.body.id)),
      204,
    );
  }, 90_000);

  it('смены и выходные', async () => {
    await call('POST /shifts/open', http().post(`${API}/shifts/open`).set(...bearer(s.manager)), 201);
    await call('GET /shifts/current', http().get(`${API}/shifts/current`).set(...bearer(s.manager)), 200);
    await call('POST /shifts/close', http().post(`${API}/shifts/close`).set(...bearer(s.manager)), 200);

    const list = await call('GET /shifts', http().get(`${API}/shifts`).set(...bearer(s.director)), 200);
    shiftId = list.body.items[0].id;

    const dayOff = await call(
      'POST /day-offs',
      http()
        .post(`${API}/day-offs`)
        .set(...bearer(s.hos))
        .send({ userId: manager.id, date: isoDay(3), reason: 'семейные обстоятельства' }),
      201,
    );
    dayOffId = dayOff.body.id;
    await call('GET /day-offs', http().get(`${API}/day-offs`).set(...bearer(s.hos)), 200);
    await call(
      'PATCH /day-offs/{id}',
      http()
        .patch(`${API}/day-offs/${dayOffId}`)
        .set(...bearer(s.hos))
        .send({ date: isoDay(4) }),
      200,
    );
    await call(
      'DELETE /day-offs/{id}',
      http()
        .delete(`${API}/day-offs/${dayOffId}`)
        .set(...bearer(s.hos))
        .set(await actionCodeHeaders(app, s.hos, 'day_off.delete', dayOffId)),
      204,
    );

    // Правка и удаление смены из API убраны (решение владельца 22.09.2026):
    // проверяем, что их действительно нет.
    expect((await http().patch(`${API}/shifts/${shiftId}`).set(...bearer(s.director)).send({ status: 'closed' })).status).toBe(404);
    expect((await http().delete(`${API}/shifts/${shiftId}`).set(...bearer(s.director))).status).toBe(404);
  }, 90_000);

  it('зарплата: настройки, расчёт, правка, подтверждение и удаление', async () => {
    await call(
      'PUT /payroll/settings',
      http()
        .put(`${API}/payroll/settings`)
        .set(...bearer(s.accountant))
        .set(await actionCodeHeaders(app, s.accountant, 'payroll.settings.update'))
        .send({ finePerMissedShiftTyiyn: '100000', taxRatePercent: '10' }),
      200,
    );
    await call('GET /payroll/settings', http().get(`${API}/payroll/settings`).set(...bearer(s.director)), 200);

    const period = isoDay().slice(0, 7);
    const generated = await call(
      'POST /payroll/entries/generate',
      http()
        .post(`${API}/payroll/entries/generate`)
        .set(...bearer(s.accountant))
        .send({ period }),
      [200, 201],
    );
    expect(generated.body.length).toBeGreaterThan(0);

    const entries = await call('GET /payroll/entries', http().get(`${API}/payroll/entries`).set(...bearer(s.director)), 200);
    const mine = entries.body.find((e: { userId: string }) => e.userId === manager.id);
    const other = entries.body.find((e: { userId: string }) => e.userId !== manager.id);

    await call('GET /payroll/entries/{id}', http().get(`${API}/payroll/entries/${mine.id}`).set(...bearer(s.director)), 200);
    await call(
      'PATCH /payroll/entries/{id}',
      http()
        .patch(`${API}/payroll/entries/${mine.id}`)
        .set(...bearer(s.accountant))
        .send({ baseSalaryTyiyn: '3000000' }),
      200,
    );
    await call(
      'POST /payroll/entries/{id}/confirm',
      http()
        .post(`${API}/payroll/entries/${mine.id}/confirm`)
        .set(...bearer(s.accountant))
        .set(await actionCodeHeaders(app, s.accountant, 'payroll.confirm', mine.id)),
      [200, 201],
    );
    expect(other).toBeDefined();
    // Удаление начисления из API убрано вместе с остальным редактированием директора.
    expect((await http().delete(`${API}/payroll/entries/${other.id}`).set(...bearer(s.director))).status).toBe(404);

    await call(
      'GET /payroll/summary',
      http()
        .get(`${API}/payroll/summary?period=${period}`)
        .set(...bearer(s.director)),
      200,
    );
  }, 120_000);

  it('бухгалтерия: операции, вложения, сводка и закрытие месяца', async () => {
    const created = await call(
      'POST /transactions',
      http()
        .post(`${API}/transactions`)
        .set(...bearer(s.accountant))
        .set(await actionCodeHeaders(app, s.accountant, 'transaction.create'))
        .send({ type: 'expense', category: 'utilities', amountTyiyn: '12345', date: isoDay(), comment: 'Счёт за свет' }),
      201,
    );
    const txId = created.body.id;

    await call('GET /transactions', http().get(`${API}/transactions`).set(...bearer(s.accountant)), 200);
    await call('GET /transactions/{id}', http().get(`${API}/transactions/${txId}`).set(...bearer(s.accountant)), 200);
    await call(
      'PATCH /transactions/{id}',
      http()
        .patch(`${API}/transactions/${txId}`)
        .set(...bearer(s.accountant))
        .set(await actionCodeHeaders(app, s.accountant, 'transaction.update', txId))
        .send({ amountTyiyn: '23456' }),
      200,
    );
    await call(
      'PUT /transactions/{id}/attachment',
      http()
        .put(`${API}/transactions/${txId}/attachment`)
        .set(...bearer(s.accountant))
        .set(await actionCodeHeaders(app, s.accountant, 'transaction.attachment', txId))
        .attach('file', PDF, { filename: 'receipt.pdf', contentType: 'application/pdf' }),
      [200, 201],
    );
    await call(
      'GET /transactions/{id}/attachment',
      binary(http().get(`${API}/transactions/${txId}/attachment`).set(...bearer(s.accountant))),
      200,
    );

    await call(
      'GET /accounting/summary',
      http()
        .get(`${API}/accounting/summary?from=${isoDay(-30)}&to=${isoDay()}`)
        .set(...bearer(s.accountant)),
      200,
    );
    await call('GET /accounting/periods', http().get(`${API}/accounting/periods`).set(...bearer(s.accountant)), 200);
    await call(
      'GET /accounting/export.xlsx',
      binary(
        http()
          .get(`${API}/accounting/export.xlsx?from=${isoDay(-30)}&to=${isoDay()}`)
          .set(...bearer(s.accountant)),
      ),
      200,
    );

    await call(
      'DELETE /transactions/{id}',
      http()
        .delete(`${API}/transactions/${txId}`)
        .set(...bearer(s.accountant))
        .set(await actionCodeHeaders(app, s.accountant, 'transaction.delete', txId)),
      204,
    );

    // Закрывается прошлый месяц: текущий закрыть нельзя, он ещё не кончился.
    await http()
      .post(`${API}/transactions`)
      .set(...bearer(s.accountant))
      .set(await actionCodeHeaders(app, s.accountant, 'transaction.create'))
      .send({ type: 'income', category: 'other_income', amountTyiyn: '5000', date: dayInPreviousPeriod() });

    const period = previousPeriod();
    await call(
      'POST /accounting/periods/{period}/close',
      http()
        .post(`${API}/accounting/periods/${period}/close`)
        .set(...bearer(s.accountant))
        .set(await actionCodeHeaders(app, s.accountant, 'accounting.period.close', period)),
      [200, 201],
    );
  }, 120_000);

  it('отчёты, сводка директора и аналитика', async () => {
    const report = await call(
      'POST /daily-reports/regenerate',
      http()
        .post(`${API}/daily-reports/regenerate`)
        .set(...bearer(s.director))
        .send({ type: 'sales', date: isoDay() }),
      [200, 201],
    );
    await call('GET /daily-reports', http().get(`${API}/daily-reports`).set(...bearer(s.director)), 200);
    await call('GET /daily-reports/{id}', http().get(`${API}/daily-reports/${report.body.id}`).set(...bearer(s.director)), 200);

    await call(
      'GET /dashboard',
      http()
        .get(`${API}/dashboard?from=${isoDay(-30)}&to=${isoDay()}`)
        .set(...bearer(s.director)),
      200,
    );
    await call(
      'GET /analytics/sales',
      http()
        .get(`${API}/analytics/sales?from=${isoDay(-30)}&to=${isoDay()}`)
        .set(...bearer(s.director)),
      200,
    );
  }, 90_000);

  it('резервные копии: статус, выгрузка директором и выгрузка агентом', async () => {
    await call('GET /backups/status', http().get(`${API}/backups/status`).set(...bearer(s.director)), 200);
    await call(
      'GET /backups/export',
      binary(
        http()
          .get(`${API}/backups/export`)
          .set(...bearer(s.director))
          .set(await actionCodeHeaders(app, s.director, 'backup.export')),
      ),
      200,
    );
    await call(
      'GET /backups/agent/export',
      binary(http().get(`${API}/backups/agent/export`).set('Authorization', `Bearer ${agentToken}`)),
      200,
    );
  }, 90_000);

  it('в Swagger не осталось ни одного непроверенного маршрута', () => {
    const document = buildOpenApiDocument(app);
    const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
    const documented = Object.entries(document.paths).flatMap(([path, item]) =>
      methods
        .filter((method) => (item as Record<string, unknown>)[method] !== undefined)
        .map((method) => `${method.toUpperCase()} ${path.replace(/^\/api\/v\d+/, '')}`),
    );

    expect(documented.length).toBeGreaterThan(0);
    expect(documented.filter((route) => !covered.has(route)).sort()).toEqual([]);
    // И наоборот: вызванный маршрут, которого нет в документе, значит опечатку в тесте.
    expect([...covered].filter((route) => !documented.includes(route)).sort()).toEqual([]);
  });
});
