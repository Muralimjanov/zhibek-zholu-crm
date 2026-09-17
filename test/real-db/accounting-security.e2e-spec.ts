/**
 * Accounting, dashboard and cross-cutting security controls against real
 * PostgreSQL: consent gate, public legal documents, Swagger, headers, body
 * limits, Excel export safety, investor data minimisation.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient, User, UserRole } from '@prisma/client';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { BusinessCalendar, periodOf } from '../../src/common/business-calendar.service';
import { LEGAL_DOCUMENTS } from '../../src/legal/legal-documents';
import { assertConnectedToTestDatabase } from './guard';
import { API, Session, bearer, createApp, login, seedUser, truncateAll } from './harness';

assertConnectedToTestDatabase();

const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

function binaryParser(res: NodeJS.ReadableStream & { setEncoding(e: string): void }, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}


// Business-rule suite: step-up email codes are covered by email-codes.e2e-spec.ts.
// Login still goes through the real emailed code.
process.env.TEST_BYPASS_ACTION_EMAIL_CODE = 'true';

describe('Accounting, dashboard and security — real PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let calendar: BusinessCalendar;
  const http = () => request(app.getHttpServer());

  let director: User, hos: User, sm: User, accountant: User, accountant2: User, investor: User;
  let s: Record<'director' | 'hos' | 'sm' | 'accountant' | 'accountant2' | 'investor', Session>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    calendar = app.get(BusinessCalendar);
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    director = await seedUser(prisma, { role: UserRole.director });
    hos = await seedUser(prisma, { role: UserRole.head_of_sales });
    sm = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id });
    accountant = await seedUser(prisma, { role: UserRole.accountant });
    accountant2 = await seedUser(prisma, { role: UserRole.accountant });
    investor = await seedUser(prisma, { role: UserRole.investor });
    s = {
      director: await login(app, director.username),
      hos: await login(app, hos.username),
      sm: await login(app, sm.username),
      accountant: await login(app, accountant.username),
      accountant2: await login(app, accountant2.username),
      investor: await login(app, investor.username),
    };
  });

  const prevMonthDay = () => calendar.addDays(`${periodOf(calendar.today())}-01`, -1);

  async function tx(session: Session, body: Record<string, unknown>) {
    return http()
      .post(`${API}/transactions`)
      .set(...bearer(session))
      .send({ type: 'expense', category: 'utilities', amountTyiyn: '12345', date: calendar.today(), ...body });
  }

  describe('Transactions', () => {
    it('accountant creates; category must match type; no future dates; others cannot create', async () => {
      const ok = await tx(s.accountant, { comment: 'Счёт за свет, ИНН 01234567890123' });
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ amountTyiyn: '12345', currency: 'KGS', comment: 'Счёт за свет, ИНН 01234567890123' });
      const row = await prisma.transaction.findUniqueOrThrow({ where: { id: ok.body.id } });
      expect(row.commentEnc).not.toContain('ИНН');

      expect((await tx(s.accountant, { type: 'income', category: 'marketing' })).status).toBe(400);
      expect((await tx(s.accountant, { date: calendar.addDays(calendar.today(), 1) })).status).toBe(400);
      expect((await tx(s.accountant, { amountTyiyn: '0' })).status).toBe(400);
      expect((await tx(s.accountant, { amountTyiyn: '12.5' })).status).toBe(400);
      expect((await tx(s.accountant, { currency: 'USD' })).status).toBe(400);
      for (const session of [s.director, s.hos, s.investor]) expect((await tx(session, {})).status).toBe(403);
      expect((await http().get(`${API}/transactions`).set(...bearer(s.investor))).status).toBe(403);
      expect((await http().get(`${API}/transactions`).set(...bearer(s.director))).body.total).toBe(1);
    });

    it('closed period locks edits for the accountant; director may still delete; own records only', async () => {
      const t = await tx(s.accountant, { date: prevMonthDay() });
      const foreign = await tx(s.accountant2, {});
      expect((await http().patch(`${API}/transactions/${foreign.body.id}`).set(...bearer(s.accountant)).send({ amountTyiyn: '1' })).status).toBe(403);

      expect((await http().post(`${API}/accounting/periods/${periodOf(calendar.today())}/close`).set(...bearer(s.accountant))).status).toBe(400);
      const period = periodOf(prevMonthDay());
      expect((await http().post(`${API}/accounting/periods/${period}/close`).set(...bearer(s.director))).status).toBe(403);
      expect((await http().post(`${API}/accounting/periods/${period}/close`).set(...bearer(s.accountant))).status).toBe(201);
      expect((await http().post(`${API}/accounting/periods/${period}/close`).set(...bearer(s.accountant))).status).toBe(409);

      expect((await http().patch(`${API}/transactions/${t.body.id}`).set(...bearer(s.accountant)).send({ amountTyiyn: '1' })).status).toBe(409);
      expect((await http().delete(`${API}/transactions/${t.body.id}`).set(...bearer(s.accountant))).status).toBe(409);
      expect((await tx(s.accountant, { date: prevMonthDay() })).status).toBe(409);
      // Moving an open-period record into the closed month is refused too.
      const current = await tx(s.accountant, {});
      expect((await http().patch(`${API}/transactions/${current.body.id}`).set(...bearer(s.accountant)).send({ date: prevMonthDay() })).status).toBe(409);

      expect((await http().patch(`${API}/transactions/${t.body.id}`).set(...bearer(s.director)).send({ amountTyiyn: '1' })).status).toBe(403);
      expect((await http().delete(`${API}/transactions/${t.body.id}`).set(...bearer(s.director))).status).toBe(204);
    });

    it('receipt attachment is private: director/accountant download with safe headers', async () => {
      const t = await tx(s.accountant, {});
      await http().put(`${API}/transactions/${t.body.id}/attachment`).set(...bearer(s.accountant)).attach('file', PDF, 'receipt.pdf').expect(200);
      const dl = await http().get(`${API}/transactions/${t.body.id}/attachment`).set(...bearer(s.director)).buffer(true).parse(binaryParser as never);
      expect(dl.status).toBe(200);
      expect(dl.headers['content-type']).toBe('application/pdf');
      expect(dl.headers['content-disposition']).toMatch(/^attachment;/);
      expect((await http().get(`${API}/transactions/${t.body.id}/attachment`).set(...bearer(s.investor))).status).toBe(403);
    });

    it('summary is broken down by category; Excel export neutralises formula injection', async () => {
      await tx(s.accountant, { type: 'income', category: 'sale_deposit', amountTyiyn: '90000000' });
      await tx(s.accountant, { category: 'marketing', amountTyiyn: '150000', comment: '=HYPERLINK("http://evil.test","click")' });

      const summary = await http().get(`${API}/accounting/summary`).query({ from: prevMonthDay(), to: calendar.today() }).set(...bearer(s.director));
      expect(summary.body).toMatchObject({ incomeTyiyn: '90000000', expenseTyiyn: '150000', netTyiyn: '89850000' });
      expect(summary.body.byCategory).toHaveLength(14);
      expect(summary.body.byCategory.find((c: { category: string }) => c.category === 'marketing')).toMatchObject({ count: 1, amountTyiyn: '150000' });

      expect((await http().get(`${API}/accounting/summary`).query({ from: '2020-01-01', to: calendar.today() }).set(...bearer(s.director))).status).toBe(400);

      const res = await http()
        .get(`${API}/accounting/export.xlsx`)
        .query({ from: calendar.today(), to: calendar.today() })
        .set(...bearer(s.accountant))
        .buffer(true)
        .parse(binaryParser as never);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as unknown as ArrayBuffer);
      const comments = wb.getWorksheet('Операции')!.getColumn(6).values.map(String);
      expect(comments).toContain('\'=HYPERLINK("http://evil.test","click")');
      expect(await prisma.auditEvent.count({ where: { action: 'ACCOUNTING_EXPORTED' } })).toBe(1);
      expect((await http().get(`${API}/accounting/export.xlsx`).query({ from: calendar.today(), to: calendar.today() }).set(...bearer(s.investor))).status).toBe(403);
    });
  });

  describe('Dashboard & analytics', () => {
    it('investor dashboard has aggregates only — no buyer or employee PII', async () => {
      await http()
        .post(`${API}/contracts`)
        .set(...bearer(s.sm))
        .send({
          fullName: 'Секретный Покупатель',
          passportNumber: 'AN7777777',
          address: 'ул. Тайная 7',
          phone: '+996777777777',
          areaSqm: '10',
          pricePerSqmTyiyn: '1000000',
          buyerConsentConfirmed: true,
          buyerConsentVersion: LEGAL_DOCUMENTS.buyer_personal_data_consent.version,
        })
        .expect(201);

      const inv = await http().get(`${API}/dashboard`).set(...bearer(s.investor));
      expect(inv.status).toBe(200);
      expect(inv.body.contracts.find((c: { status: string }) => c.status === 'draft')).toMatchObject({ count: 1, totalAmountTyiyn: '10000000' });
      expect(JSON.stringify(inv.body)).not.toMatch(/Секретный|AN7777777|Тайная|777777777|fullName|managerId/);
      const dir = await http().get(`${API}/dashboard`).set(...bearer(s.director));
      expect(dir.body).toEqual(inv.body);

      for (const session of [s.sm, s.hos, s.accountant]) {
        expect((await http().get(`${API}/dashboard`).set(...bearer(session))).status).toBe(403);
      }
    });

    it('sales analytics: head of sales sees own team only', async () => {
      const outsider = await seedUser(prisma, { role: UserRole.sales_manager });
      const res = await http().get(`${API}/analytics/sales`).set(...bearer(s.hos));
      const ids = res.body.perManager.map((m: { userId: string }) => m.userId).sort();
      expect(ids).toEqual([hos.id, sm.id].sort());
      expect(ids).not.toContain(outsider.id);
      expect((await http().get(`${API}/analytics/sales`).set(...bearer(s.investor))).status).toBe(403);
    });
  });

  describe('Consent gate and legal documents', () => {
    it('without accepted documents business endpoints are blocked; session/profile/legal stay usable', async () => {
      const fresh = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id, consented: false });
      const session = await login(app, fresh.username);

      const blocked = await http().get(`${API}/bookings`).set(...bearer(session));
      expect(blocked.status).toBe(403);
      expect(blocked.body.message).toBe('CONSENT_REQUIRED');
      await http().get(`${API}/auth/me`).set(...bearer(session)).expect(200);
      await http().patch(`${API}/users/me`).set(...bearer(session)).send({ phone: '+996555111222' }).expect(200);

      const status = await http().get(`${API}/consents/status`).set(...bearer(session));
      expect(status.body.allRequiredAccepted).toBe(false);

      for (const item of status.body.required) {
        await http().post(`${API}/consents`).set(...bearer(session)).send({ policyType: item.policyType, policyVersion: item.currentVersion }).expect(201);
      }
      expect((await http().get(`${API}/consents/status`).set(...bearer(session))).body.allRequiredAccepted).toBe(true);
      await http().get(`${API}/bookings`).set(...bearer(session)).expect(200);

      // The buyer form is not something a user "accepts" for themselves.
      const buyer = await http()
        .post(`${API}/consents`)
        .set(...bearer(session))
        .send({ policyType: 'buyer_personal_data_consent', policyVersion: LEGAL_DOCUMENTS.buyer_personal_data_consent.version });
      expect(buyer.status).toBe(400);
    });

    it('legal documents are public, versioned drafts', async () => {
      const list = await http().get(`${API}/legal/documents`);
      expect(list.status).toBe(200);
      expect(list.body.map((d: { type: string }) => d.type).sort()).toEqual(
        ['buyer_personal_data_consent', 'cookie_policy', 'personal_data_processing', 'privacy_policy', 'terms_of_use'].sort(),
      );
      expect(list.body[0]).not.toHaveProperty('content');
      const privacy = await http().get(`${API}/legal/documents/privacy_policy`);
      expect(privacy.body).toMatchObject({ draft: true, version: LEGAL_DOCUMENTS.privacy_policy.version });
      expect(privacy.body.content).toContain('Политика конфиденциальности');
      const cookie = await http().get(`${API}/legal/documents/cookie_policy`);
      expect(cookie.body.content).toContain('uzz_refresh');
      expect((await http().get(`${API}/legal/documents/unknown`)).status).toBe(404);
    });
  });

  describe('HTTP hardening', () => {
    it('security headers, no framework fingerprint, body size limit, safe errors, Swagger outside production', async () => {
      const res = await http().get(`${API}/legal/documents`);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();

      const huge = await http()
        .patch(`${API}/users/me`)
        .set(...bearer(s.sm))
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ fullName: 'x'.repeat(200 * 1024) }));
      expect(huge.status).toBe(413);
      expect(huge.body).toEqual({ statusCode: 413, message: 'PAYLOAD_TOO_LARGE' });

      const malformed = await http().post(`${API}/auth/login`).set('Content-Type', 'application/json').send('{"username":');
      expect(malformed.status).toBe(400);
      expect(JSON.stringify(malformed.body)).not.toMatch(/stack|SyntaxError|at /);

      const docs = await http().get(`${API}/docs`).redirects(1);
      expect(docs.status).toBe(200);
      expect(docs.text).toContain('swagger');
    });

    it('every business route rejects anonymous access', async () => {
      const routes: Array<[string, string]> = [
        ['get', '/bookings'], ['get', '/contracts'], ['post', '/shifts/open'], ['get', '/day-offs'],
        ['get', '/payroll/entries'], ['get', '/transactions'], ['get', '/accounting/summary'],
        ['get', '/daily-reports'], ['get', '/dashboard'], ['get', '/analytics/sales'], ['get', '/users'],
      ];
      for (const [method, path] of routes) {
        const res = await (http() as unknown as Record<string, (p: string) => request.Test>)[method](`${API}${path}`);
        expect({ path, status: res.status }).toEqual({ path, status: 401 });
      }
    });
  });
});
