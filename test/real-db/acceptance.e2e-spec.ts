/**
 * End-to-end acceptance of the TZ chains across roles, against real
 * PostgreSQL and real SMTP (Mailpit):
 *
 *   booking -> contract -> deposit -> accounting entry
 *   shift close -> daily reports (both types, both investors)
 *   missed shift -> payroll with fine and tax
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient, User, UserRole } from '@prisma/client';
import request from 'supertest';
import { BusinessCalendar, periodOf, toDbDate } from '../../src/common/business-calendar.service';
import { MissedShiftsService } from '../../src/attendance/missed-shifts.service';
import { LEGAL_DOCUMENTS } from '../../src/legal/legal-documents';
import { assertConnectedToTestDatabase } from './guard';
import { API, Session, bearer, createApp, login, seedUser, truncateAll } from './harness';

assertConnectedToTestDatabase();

const BUYER_CONSENT = { buyerConsentConfirmed: true, buyerConsentVersion: LEGAL_DOCUMENTS.buyer_personal_data_consent.version };

// Step-up codes are covered by email-codes.e2e-spec.ts; this suite is about the business chains.
process.env.TEST_BYPASS_ACTION_EMAIL_CODE = 'true';

describe('Acceptance by role — real PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let calendar: BusinessCalendar;
  const http = () => request(app.getHttpServer());

  let director: User, hos: User, manager: User, manager2: User, accountant: User, investor1: User, investor2: User;
  let s: Record<'director' | 'hos' | 'manager' | 'manager2' | 'accountant' | 'investor1' | 'investor2', Session>;

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
    director = await seedUser(prisma, { role: UserRole.director, fullName: 'Асанов Бакыт' });
    hos = await seedUser(prisma, { role: UserRole.head_of_sales, fullName: 'Мамытова Айгуль', createdById: director.id });
    manager = await seedUser(prisma, { role: UserRole.sales_manager, fullName: 'Жумабаев Нурлан', createdById: hos.id, teamLeadId: hos.id });
    manager2 = await seedUser(prisma, { role: UserRole.sales_manager, fullName: 'Садыкова Динара', createdById: hos.id, teamLeadId: hos.id });
    accountant = await seedUser(prisma, { role: UserRole.accountant, fullName: 'Исмаилова Гульнара', createdById: director.id });
    investor1 = await seedUser(prisma, { role: UserRole.investor, fullName: 'Токтосунов Азамат', createdById: director.id });
    investor2 = await seedUser(prisma, { role: UserRole.investor, fullName: 'Орозова Чолпон', createdById: director.id });
    s = {
      director: await login(app, director.username),
      hos: await login(app, hos.username),
      manager: await login(app, manager.username),
      manager2: await login(app, manager2.username),
      accountant: await login(app, accountant.username),
      investor1: await login(app, investor1.username),
      investor2: await login(app, investor2.username),
    };
  });

  it('sale chain: booking -> contract -> deposit -> income entry linked to the contract', async () => {
    // 1. Manager books an area for a buyer.
    const booking = await http()
      .post(`${API}/bookings`)
      .set(...bearer(s.manager))
      .send({ fullName: 'Асанов Бакыт', passportNumber: 'AN 1234567', phone: '+996 555 12-34-56', desiredAreaSqm: '60', ...BUYER_CONSENT });
    expect(booking.status).toBe(201);

    // 2. Converts it into a contract: 60 m² x 50 000 KGS = 3 000 000, deposit 30% = 900 000 (TZ example).
    const contract = await http()
      .post(`${API}/bookings/${booking.body.id}/convert`)
      .set(...bearer(s.manager))
      .send({ address: 'г. Ош, ул. Ленина 1', pricePerSqmTyiyn: '5000000', ...BUYER_CONSENT });
    expect(contract.status).toBe(201);
    expect(contract.body).toMatchObject({ totalAmountTyiyn: '300000000', depositAmountTyiyn: '90000000', status: 'draft' });
    expect((await http().get(`${API}/bookings/${booking.body.id}`).set(...bearer(s.manager))).body.status).toBe('converted');

    // 3. The accountant marks the deposit as paid (finance view has no buyer PII).
    const financeView = await http().get(`${API}/contracts/${contract.body.id}`).set(...bearer(s.accountant));
    expect(financeView.status).toBe(200);
    expect(financeView.body.fullName).toBeUndefined();
    const paid = await http().post(`${API}/contracts/${contract.body.id}/deposit`).set(...bearer(s.accountant)).send({ paid: true });
    expect(paid.status).toBe(201);
    expect(paid.body).toMatchObject({ status: 'deposit_paid', depositPaid: true });

    // 4. The deposit is NOT booked automatically (OPEN_QUESTIONS B10) - the accountant records it.
    expect((await http().get(`${API}/transactions`).set(...bearer(s.accountant))).body.total).toBe(0);
    const entry = await http()
      .post(`${API}/transactions`)
      .set(...bearer(s.accountant))
      .send({
        type: 'income',
        category: 'sale_deposit',
        amountTyiyn: paid.body.depositAmountTyiyn,
        date: calendar.today(),
        relatedContractId: contract.body.id,
        comment: 'Взнос 30% по договору',
      });
    expect(entry.status).toBe(201);
    expect(entry.body.relatedContractId).toBe(contract.body.id);

    // Filtering by contract is what ties payments to a deal.
    const byContract = await http().get(`${API}/transactions`).query({ relatedContractId: contract.body.id }).set(...bearer(s.director));
    expect(byContract.body.total).toBe(1);

    // 5. Summary and dashboard show the income; the manager cannot see accounting at all.
    const range = { from: `${periodOf(calendar.today())}-01`, to: calendar.today() };
    const summary = await http().get(`${API}/accounting/summary`).query(range).set(...bearer(s.accountant));
    expect(summary.body).toMatchObject({ incomeTyiyn: '90000000', expenseTyiyn: '0', netTyiyn: '90000000' });
    expect(summary.body.byCategory.find((c: { category: string }) => c.category === 'sale_deposit')).toMatchObject({ count: 1, amountTyiyn: '90000000' });
    expect((await http().get(`${API}/transactions`).set(...bearer(s.manager))).status).toBe(403);

    const dashboard = await http().get(`${API}/dashboard`).query(range).set(...bearer(s.investor1));
    expect(dashboard.body.depositsPaid).toEqual({ count: 1, amountTyiyn: '90000000' });
    expect(JSON.stringify(dashboard.body)).not.toContain('1234567'); // no buyer PII for investors
  });

  it('shift chain: closing the accountant and head-of-sales shifts publishes both reports to the director and BOTH investors', async () => {
    const today = calendar.today();
    // Data for the day: one booking by each manager and one expense.
    for (const seller of [s.manager, s.manager2]) {
      await http()
        .post(`${API}/bookings`)
        .set(...bearer(seller))
        .send({ fullName: 'Покупатель Дня', passportNumber: `ID ${Math.floor(1e6 + Math.random() * 8e6)}`, phone: '+996555777888', desiredAreaSqm: '25', ...BUYER_CONSENT });
    }
    await http()
      .post(`${API}/transactions`)
      .set(...bearer(s.accountant))
      .send({ type: 'expense', category: 'construction_materials', amountTyiyn: '4500000', date: today, comment: 'Цемент' });

    // Manager 1 works today, manager 2 does not open a shift at all.
    await http().post(`${API}/shifts/open`).set(...bearer(s.manager)).expect(201);

    const accountantClose = await http().post(`${API}/shifts/open`).set(...bearer(s.accountant)).then(() => http().post(`${API}/shifts/close`).set(...bearer(s.accountant)));
    expect(accountantClose.body.reportGenerated).toBe('financial');
    const hosClose = await http().post(`${API}/shifts/open`).set(...bearer(s.hos)).then(() => http().post(`${API}/shifts/close`).set(...bearer(s.hos)));
    expect(hosClose.body.reportGenerated).toBe('sales');

    // Both investors see both reports, identically to the director (TZ: no difference).
    const forDirector = await http().get(`${API}/daily-reports`).set(...bearer(s.director));
    const forInvestor1 = await http().get(`${API}/daily-reports`).set(...bearer(s.investor1));
    const forInvestor2 = await http().get(`${API}/daily-reports`).set(...bearer(s.investor2));
    expect(forDirector.body.total).toBe(2);
    expect(forInvestor1.body).toEqual(forDirector.body);
    expect(forInvestor2.body).toEqual(forDirector.body);
    for (const list of [forInvestor1, forInvestor2]) {
      expect(list.body.items.map((r: { type: string }) => r.type).sort()).toEqual(['financial', 'sales']);
    }
    const single = forInvestor2.body.items[0];
    expect((await http().get(`${API}/daily-reports/${single.id}`).set(...bearer(s.investor2))).status).toBe(200);

    // The sales report names who did not open a shift (attendance.notOpened).
    const sales = forInvestor1.body.items.find((r: { type: string }) => r.type === 'sales');
    expect(sales.date).toBe(today);
    expect(sales.data.attendance).toMatchObject({ teamSize: 2, opened: 1, onDayOff: 0 });
    expect(sales.data.attendance.notOpened).toEqual([{ userId: manager2.id, fullName: 'Садыкова Динара' }]);
    expect(sales.summary).toContain('Не открыли смену: Садыкова Динара');
    expect(sales.data.newBookings.count).toBe(2);

    const financial = forInvestor1.body.items.find((r: { type: string }) => r.type === 'financial');
    expect(financial.data.expenseTyiyn).toBe('4500000');

    // Scope per role: head of sales - sales only, accountant - financial only, manager - nothing.
    expect((await http().get(`${API}/daily-reports`).query({ type: 'financial' }).set(...bearer(s.hos))).status).toBe(403);
    expect((await http().get(`${API}/daily-reports`).query({ type: 'sales' }).set(...bearer(s.accountant))).status).toBe(403);
    expect((await http().get(`${API}/daily-reports`).set(...bearer(s.manager))).status).toBe(403);
    // ... and investors cannot reach the sales pipeline itself.
    expect((await http().get(`${API}/bookings`).set(...bearer(s.investor2))).status).toBe(403);
  });

  it('payroll chain: a missed working day becomes a fine, and the director sees every employee entry', async () => {
    // A past working day with no shift and no day off -> the cron records "missed".
    const [missedDay] = calendar.pastWorkingDays(calendar.today(), 7);
    // Accounts created on or after that day are not penalised for it.
    await prisma.user.updateMany({ data: { createdAt: new Date(calendar.dayBounds(missedDay).start.getTime() - 86_400_000) } });
    expect(await app.get(MissedShiftsService).recordMissedFor(missedDay)).toBeGreaterThan(0);
    const missed = await prisma.shift.findMany({ where: { date: toDbDate(missedDay), status: 'missed' } });
    expect(missed.map((m) => m.userId).sort()).toEqual([hos.id, manager.id, manager2.id, accountant.id].sort());

    // The accountant sets the rules and generates the month.
    await http().put(`${API}/payroll/settings`).set(...bearer(s.accountant)).send({ finePerMissedShiftTyiyn: '100000', taxRatePercent: '10' }).expect(200);
    const period = periodOf(missedDay);
    const generated = await http().post(`${API}/payroll/entries/generate`).set(...bearer(s.accountant)).send({ period });
    expect(generated.status).toBe(200);
    // TZ: entries for head of sales, sales managers and the accountant - not the director or investors.
    expect(generated.body.map((e: { userId: string }) => e.userId).sort()).toEqual([hos.id, manager.id, manager2.id, accountant.id].sort());

    // Salary 30 000 KGS, 1 missed day: fine 1 000, tax 10% = 3 000, final 26 000.
    const target = generated.body.find((e: { userId: string }) => e.userId === manager.id);
    const updated = await http().patch(`${API}/payroll/entries/${target.id}`).set(...bearer(s.accountant)).send({ baseSalaryTyiyn: '3000000' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      missedShiftsCount: 1,
      fineAmountTyiyn: '100000',
      taxAmountTyiyn: '300000',
      finalAmountTyiyn: '2600000',
      status: 'draft',
    });

    const confirmed = await http().post(`${API}/payroll/entries/${target.id}/confirm`).set(...bearer(s.accountant));
    expect(confirmed.body.status).toBe('confirmed');
    expect((await http().patch(`${API}/payroll/entries/${target.id}`).set(...bearer(s.accountant)).send({ baseSalaryTyiyn: '1' })).status).toBe(409);

    // The director sees ALL entries with employee names and roles (TZ "Payroll & Shift overview").
    const forDirector = await http().get(`${API}/payroll/entries`).query({ period }).set(...bearer(s.director));
    expect(forDirector.status).toBe(200);
    expect(forDirector.body).toHaveLength(4);
    expect(forDirector.body.map((e: { employeeFullName: string }) => e.employeeFullName).sort()).toEqual(
      ['Жумабаев Нурлан', 'Исмаилова Гульнара', 'Мамытова Айгуль', 'Садыкова Динара'].sort(),
    );
    expect(forDirector.body.every((e: { employeeRole: string }) => ['head_of_sales', 'sales_manager', 'accountant'].includes(e.employeeRole))).toBe(true);
    expect((await http().get(`${API}/payroll/entries/${target.id}`).set(...bearer(s.director))).status).toBe(200);

    // Everyone else: manager - own only, head of sales and investor - no access (B8 confirmed by the owner).
    const forManager = await http().get(`${API}/payroll/entries`).set(...bearer(s.manager));
    expect(forManager.body.map((e: { userId: string }) => e.userId)).toEqual([manager.id]);
    expect((await http().get(`${API}/payroll/entries`).set(...bearer(s.hos))).status).toBe(403);
    expect((await http().get(`${API}/payroll/entries`).set(...bearer(s.investor1))).status).toBe(403);
    expect((await http().get(`${API}/payroll/settings`).set(...bearer(s.director))).status).toBe(200);

    // The confirmed payroll shows up in the director/investor dashboard.
    const dash = await http().get(`${API}/dashboard`).query({ from: `${period}-01`, to: calendar.today() }).set(...bearer(s.investor2));
    expect(dash.body.payrollConfirmed).toMatchObject({ entries: 1, finalAmountTyiyn: '2600000', taxAmountTyiyn: '300000', fineAmountTyiyn: '100000' });
    expect(dash.body.attendance.missedShifts).toBeGreaterThanOrEqual(4);
  });
});
