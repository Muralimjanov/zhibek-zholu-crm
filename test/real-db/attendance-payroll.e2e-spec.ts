/**
 * Shifts, day-offs, missed-shift job, daily reports and payroll against
 * real PostgreSQL.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient, ShiftStatus, User, UserRole } from '@prisma/client';
import request from 'supertest';
import { MissedShiftsService } from '../../src/attendance/missed-shifts.service';
import { BusinessCalendar, periodOf, toDbDate } from '../../src/common/business-calendar.service';
import { LEGAL_DOCUMENTS } from '../../src/legal/legal-documents';
import { assertConnectedToTestDatabase } from './guard';
import { API, Session, bearer, createApp, login, seedUser, truncateAll } from './harness';

assertConnectedToTestDatabase();

const LONG_AGO = new Date('2025-01-01T00:00:00Z');


// Business-rule suite: step-up email codes are covered by email-codes.e2e-spec.ts.
// Login still goes through the real emailed code.
process.env.TEST_BYPASS_ACTION_EMAIL_CODE = 'true';

describe('Attendance, reports and payroll — real PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let calendar: BusinessCalendar;
  let missed: MissedShiftsService;
  const http = () => request(app.getHttpServer());

  let director: User, hos: User, hosOther: User, sm1: User, sm2: User, smOther: User, accountant: User, investor: User;
  let s: Record<'director' | 'hos' | 'hosOther' | 'sm1' | 'sm2' | 'smOther' | 'accountant' | 'investor', Session>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    calendar = app.get(BusinessCalendar);
    missed = app.get(MissedShiftsService);
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    director = await seedUser(prisma, { role: UserRole.director, createdAt: LONG_AGO });
    hos = await seedUser(prisma, { role: UserRole.head_of_sales, createdAt: LONG_AGO });
    hosOther = await seedUser(prisma, { role: UserRole.head_of_sales, createdAt: LONG_AGO });
    sm1 = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id, fullName: 'Иванов Иван', createdAt: LONG_AGO });
    sm2 = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id, fullName: 'Петрова Анна', createdAt: LONG_AGO });
    smOther = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hosOther.id, createdAt: LONG_AGO });
    accountant = await seedUser(prisma, { role: UserRole.accountant, createdAt: LONG_AGO });
    investor = await seedUser(prisma, { role: UserRole.investor, createdAt: LONG_AGO });
    s = {
      director: await login(app, director.username),
      hos: await login(app, hos.username),
      hosOther: await login(app, hosOther.username),
      sm1: await login(app, sm1.username),
      sm2: await login(app, sm2.username),
      smOther: await login(app, smOther.username),
      accountant: await login(app, accountant.username),
      investor: await login(app, investor.username),
    };
  });

  const lastWorkingDay = () => calendar.pastWorkingDays(calendar.today(), 7)[0];

  describe('Shifts', () => {
    it('open/close lifecycle; one shift per day; roles without the button get 403', async () => {
      const opened = await http().post(`${API}/shifts/open`).set(...bearer(s.sm1));
      expect(opened.status).toBe(201);
      expect(opened.body).toMatchObject({ status: 'open', userId: sm1.id, date: calendar.today() });

      expect((await http().post(`${API}/shifts/open`).set(...bearer(s.sm1))).status).toBe(409);
      for (const session of [s.director, s.investor]) {
        expect((await http().post(`${API}/shifts/open`).set(...bearer(session))).status).toBe(403);
      }

      const closed = await http().post(`${API}/shifts/close`).set(...bearer(s.sm1));
      expect(closed.status).toBe(200);
      expect(closed.body).toMatchObject({ status: 'closed', reportGenerated: null });
      expect((await http().post(`${API}/shifts/close`).set(...bearer(s.sm1))).status).toBe(409);
      expect((await http().post(`${API}/shifts/open`).set(...bearer(s.sm1))).status).toBe(409);
    });

    it('read scope: manager own, head of sales team + own, accountant/director all, investor none', async () => {
      for (const session of [s.sm1, s.sm2, s.smOther, s.hos]) {
        await http().post(`${API}/shifts/open`).set(...bearer(session)).expect(201);
      }
      const userIds = async (session: Session) =>
        ((await http().get(`${API}/shifts`).set(...bearer(session))).body.items as Array<{ userId: string }>).map((x) => x.userId).sort();

      expect(await userIds(s.sm1)).toEqual([sm1.id]);
      expect(await userIds(s.hos)).toEqual([hos.id, sm1.id, sm2.id].sort());
      expect((await userIds(s.accountant)).length).toBe(4);
      expect((await userIds(s.director)).length).toBe(4);
      expect((await http().get(`${API}/shifts`).set(...bearer(s.investor))).status).toBe(403);
    });

    it('записи смен неизменны: править и удалять смену не может никто', async () => {
      await missed.recordMissedFor(lastWorkingDay());
      const missedShift = await prisma.shift.findFirstOrThrow({ where: { userId: sm1.id, status: ShiftStatus.missed } });

      // Правка и удаление были только у директора и убраны из API целиком
      // (решение владельца 22.09.2026), поэтому маршрутов больше нет.
      for (const session of [s.director, s.hos, s.sm1, s.accountant]) {
        expect((await http().patch(`${API}/shifts/${missedShift.id}`).set(...bearer(session)).send({ status: 'closed' })).status).toBe(404);
        expect((await http().delete(`${API}/shifts/${missedShift.id}`).set(...bearer(session))).status).toBe(404);
      }
      // Запись осталась нетронутой.
      const after = await prisma.shift.findUniqueOrThrow({ where: { id: missedShift.id } });
      expect(after.status).toBe(ShiftStatus.missed);
    });
  });

  describe('Missed shifts job', () => {
    it('records missed for employees without a shift or day off; idempotent; never for today or weekends', async () => {
      const day = lastWorkingDay();
      await prisma.shift.create({
        data: { userId: sm2.id, date: toDbDate(day), status: ShiftStatus.closed, openedAt: new Date(), closedAt: new Date() },
      });
      await prisma.dayOff.create({ data: { userId: accountant.id, date: toDbDate(day), approvedById: director.id } });

      const created = await missed.recordMissedFor(day);
      const rows = await prisma.shift.findMany({ where: { date: toDbDate(day), status: ShiftStatus.missed } });
      expect(rows.map((r) => r.userId).sort()).toEqual([hos.id, hosOther.id, sm1.id, smOther.id].sort());
      expect(created).toBe(4);
      // Director and investors have no shift button.
      expect(rows.some((r) => r.userId === director.id || r.userId === investor.id)).toBe(false);

      expect(await missed.recordMissedFor(day)).toBe(0);
      expect(await missed.recordMissedFor(calendar.today())).toBe(0);
      const saturday = [1, 2, 3, 4, 5, 6, 7].map((i) => calendar.addDays(calendar.today(), -i)).find((d) => !calendar.isWorkingDay(d))!;
      expect(await missed.recordMissedFor(saturday)).toBe(0);
    });

    it('does not penalise an employee created after that day', async () => {
      const newcomer = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id });
      await missed.recordMissedFor(lastWorkingDay());
      expect(await prisma.shift.count({ where: { userId: newcomer.id } })).toBe(0);
    });
  });

  describe('Day offs', () => {
    const tomorrow = () => calendar.addDays(calendar.today(), 1);

    it('head of sales approves in advance for own team only; managers cannot', async () => {
      const ok = await http().post(`${API}/day-offs`).set(...bearer(s.hos)).send({ userId: sm1.id, date: tomorrow(), reason: 'семейные обстоятельства' });
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ userId: sm1.id, approvedById: hos.id, reason: 'семейные обстоятельства' });
      const row = await prisma.dayOff.findUniqueOrThrow({ where: { id: ok.body.id } });
      expect(row.reasonEnc).not.toContain('семейные');

      expect((await http().post(`${API}/day-offs`).set(...bearer(s.hos)).send({ userId: smOther.id, date: tomorrow() })).status).toBe(403);
      expect((await http().post(`${API}/day-offs`).set(...bearer(s.sm1)).send({ userId: sm1.id, date: tomorrow() })).status).toBe(403);
      expect((await http().post(`${API}/day-offs`).set(...bearer(s.hos)).send({ userId: sm1.id, date: tomorrow() })).status).toBe(409);

      const mine = await http().get(`${API}/day-offs`).set(...bearer(s.sm2));
      expect(mine.body.items).toHaveLength(0);
    });

    it('cannot erase a recorded missed day retroactively', async () => {
      const day = lastWorkingDay();
      await missed.recordMissedFor(day);

      const past = await http().post(`${API}/day-offs`).set(...bearer(s.hos)).send({ userId: sm1.id, date: day });
      expect(past.status).toBe(400);
      expect(past.body.message).toBe('DAY_OFF_DATE_IN_PAST');
      // Выходные теперь заводит только начальник продаж: у директора
      // редактирования не осталось (решение владельца 22.09.2026).
      const pastDirector = await http().post(`${API}/day-offs`).set(...bearer(s.director)).send({ userId: sm1.id, date: day });
      expect(pastDirector.status).toBe(403);

      // Today, after the shift was already opened, is also refused.
      await http().post(`${API}/shifts/open`).set(...bearer(s.sm2)).expect(201);
      const today = await http().post(`${API}/day-offs`).set(...bearer(s.hos)).send({ userId: sm2.id, date: calendar.today() });
      expect(today.status).toBe(409);

      // An old day-off cannot be deleted or moved either.
      const old = await prisma.dayOff.create({ data: { userId: sm1.id, date: toDbDate(calendar.addDays(day, -7)), approvedById: hos.id } });
      expect((await http().delete(`${API}/day-offs/${old.id}`).set(...bearer(s.hos))).status).toBe(400);
      expect(await prisma.shift.count({ where: { userId: sm1.id, status: ShiftStatus.missed } })).toBe(1);
    });
  });

  describe('Daily reports', () => {
    it('closing the head of sales shift generates an encrypted sales report visible to director and investors', async () => {
      await http()
        .post(`${API}/bookings`)
        .set(...bearer(s.sm1))
        .send({
          fullName: 'Покупатель Один',
          passportNumber: 'AN1234567',
          phone: '+996555000000',
          desiredAreaSqm: '42.5',
          buyerConsentConfirmed: true,
          buyerConsentVersion: LEGAL_DOCUMENTS.buyer_personal_data_consent.version,
        })
        .expect(201);
      await http().post(`${API}/shifts/open`).set(...bearer(s.sm1)).expect(201);
      await http().post(`${API}/day-offs`).set(...bearer(s.hos)).send({ userId: sm2.id, date: calendar.today() }).expect(201);
      await http().post(`${API}/shifts/open`).set(...bearer(s.hos)).expect(201);

      const closed = await http().post(`${API}/shifts/close`).set(...bearer(s.hos));
      expect(closed.body.reportGenerated).toBe('sales');

      const row = await prisma.dailyReport.findFirstOrThrow({ where: { type: 'sales' } });
      expect(row.contentEnc).toMatch(/^enc:v1:/);
      expect(row.contentEnc).not.toContain('42.5');

      for (const session of [s.director, s.investor]) {
        const feed = await http().get(`${API}/daily-reports`).set(...bearer(session));
        expect(feed.status).toBe(200);
        expect(feed.body.items).toHaveLength(1);
        const report = feed.body.items[0];
        expect(report).toMatchObject({ type: 'sales', date: calendar.today() });
        expect(report.data.newBookings).toEqual({ count: 1, areaSqm: '42.50' });
        expect(report.data.attendance).toMatchObject({ teamSize: 2, opened: 1, onDayOff: 1, notOpened: [] });
        expect(report.summary).toContain('Новые бронирования: 1');
        // Aggregates only - no buyer PII in a report.
        expect(JSON.stringify(report)).not.toMatch(/Покупатель|AN1234567|555000000/);
      }
      expect((await http().get(`${API}/daily-reports?type=financial`).set(...bearer(s.hos))).status).toBe(403);
      expect((await http().get(`${API}/daily-reports`).set(...bearer(s.sm1))).status).toBe(403);
    });

    it('names team members who did not open a shift; accountant closing produces the financial report', async () => {
      await http().post(`${API}/shifts/open`).set(...bearer(s.hos)).expect(201);
      await http().post(`${API}/shifts/close`).set(...bearer(s.hos)).expect(200);
      const sales = await http().get(`${API}/daily-reports?type=sales`).set(...bearer(s.director));
      expect(sales.body.items[0].summary).toContain('Не открыли смену: ');
      expect(sales.body.items[0].summary).toContain('Иванов Иван');
      expect(sales.body.items[0].summary).toContain('Петрова Анна');

      await http()
        .post(`${API}/transactions`)
        .set(...bearer(s.accountant))
        .send({ type: 'income', category: 'sale_deposit', amountTyiyn: '90000000', date: calendar.today() })
        .expect(201);
      await http()
        .post(`${API}/transactions`)
        .set(...bearer(s.accountant))
        .send({ type: 'expense', category: 'marketing', amountTyiyn: '1500050', date: calendar.today() })
        .expect(201);
      await http().post(`${API}/shifts/open`).set(...bearer(s.accountant)).expect(201);
      const closed = await http().post(`${API}/shifts/close`).set(...bearer(s.accountant));
      expect(closed.body.reportGenerated).toBe('financial');

      const fin = await http().get(`${API}/daily-reports?type=financial`).set(...bearer(s.accountant));
      expect(fin.body.items[0].data).toMatchObject({ incomeTyiyn: '90000000', expenseTyiyn: '1500050', netTyiyn: '88499950' });
      expect(fin.body.items[0].summary).toContain('Итог дня: 884 999,50 сом');
      expect((await http().get(`${API}/daily-reports?type=sales`).set(...bearer(s.accountant))).status).toBe(403);

      expect((await http().post(`${API}/daily-reports/regenerate`).set(...bearer(s.accountant)).send({ type: 'financial', date: calendar.today() })).status).toBe(403);
      const regen = await http().post(`${API}/daily-reports/regenerate`).set(...bearer(s.director)).send({ type: 'financial', date: calendar.today() });
      expect(regen.status).toBe(201);
      expect(await prisma.dailyReport.count({ where: { type: 'financial' } })).toBe(1);
    });
  });

  describe('Payroll', () => {
    const period = () => periodOf(calendar.today());

    async function configure() {
      await http()
        .put(`${API}/payroll/settings`)
        .set(...bearer(s.accountant))
        .send({ finePerMissedShiftTyiyn: '100000', taxRatePercent: '10' })
        .expect(200);
    }

    it('reproduces the TZ example: 30 000 salary, 10% tax, 2 missed × 1 000 -> 25 000', async () => {
      expect((await http().post(`${API}/payroll/entries/generate`).set(...bearer(s.accountant)).send({ period: period() })).status).toBe(409);
      await configure();

      const { start } = { start: toDbDate(`${period()}-01`) };
      await prisma.shift.createMany({
        data: [0, 1].map((i) => ({
          userId: sm1.id,
          date: new Date(start.getTime() + i * 86_400_000),
          status: ShiftStatus.missed,
        })),
      });

      const generated = await http().post(`${API}/payroll/entries/generate`).set(...bearer(s.accountant)).send({ period: period() });
      expect(generated.status).toBe(200);
      // head_of_sales ×2, sales_manager ×3, accountant ×1; no director/investor.
      expect(generated.body).toHaveLength(6);
      const entry = generated.body.find((e: { userId: string }) => e.userId === sm1.id);
      expect(entry).toMatchObject({ missedShiftsCount: 2, fineAmountTyiyn: '200000', employeeFullName: 'Иванов Иван' });

      const updated = await http()
        .patch(`${API}/payroll/entries/${entry.id}`)
        .set(...bearer(s.accountant))
        .send({ baseSalaryTyiyn: '3000000' });
      expect(updated.body).toMatchObject({ baseSalaryTyiyn: '3000000', taxAmountTyiyn: '300000', fineAmountTyiyn: '200000', finalAmountTyiyn: '2500000' });

      const confirmed = await http().post(`${API}/payroll/entries/${entry.id}/confirm`).set(...bearer(s.accountant));
      expect(confirmed.body).toMatchObject({ status: 'confirmed', confirmedById: accountant.id });
      expect((await http().patch(`${API}/payroll/entries/${entry.id}`).set(...bearer(s.accountant)).send({ baseSalaryTyiyn: '1' })).status).toBe(409);
      expect((await http().post(`${API}/payroll/entries/${entry.id}/confirm`).set(...bearer(s.accountant))).status).toBe(409);

      // Regenerating never touches a confirmed entry.
      await prisma.shift.create({ data: { userId: sm1.id, date: new Date(start.getTime() + 2 * 86_400_000), status: ShiftStatus.missed } });
      await http().post(`${API}/payroll/entries/generate`).set(...bearer(s.accountant)).send({ period: period() }).expect(200);
      expect((await prisma.payrollEntry.findUniqueOrThrow({ where: { id: entry.id } })).missedShiftsCount).toBe(2);
    });

    it('manual fine correction survives regeneration of a draft', async () => {
      await configure();
      const generated = await http().post(`${API}/payroll/entries/generate`).set(...bearer(s.accountant)).send({ period: period() });
      const entry = generated.body.find((e: { userId: string }) => e.userId === sm2.id);
      await http().patch(`${API}/payroll/entries/${entry.id}`).set(...bearer(s.accountant)).send({ baseSalaryTyiyn: '2000000', fineAmountTyiyn: '50000' }).expect(200);
      await http().post(`${API}/payroll/entries/generate`).set(...bearer(s.accountant)).send({ period: period() }).expect(200);
      const after = await http().get(`${API}/payroll/entries/${entry.id}`).set(...bearer(s.accountant));
      expect(after.body).toMatchObject({ fineManuallyAdjusted: true, fineAmountTyiyn: '50000', finalAmountTyiyn: '1750000' });
    });

    it('access: manager sees only own entries; head of sales and investor have no payroll access; settings are accountant-only', async () => {
      await configure();
      await http().post(`${API}/payroll/entries/generate`).set(...bearer(s.accountant)).send({ period: period() }).expect(200);

      const mine = await http().get(`${API}/payroll/entries`).set(...bearer(s.sm1));
      expect(mine.body.map((e: { userId: string }) => e.userId)).toEqual([sm1.id]);
      const other = await prisma.payrollEntry.findFirstOrThrow({ where: { userId: sm2.id } });
      expect((await http().get(`${API}/payroll/entries/${other.id}`).set(...bearer(s.sm1))).status).toBe(404);

      for (const session of [s.hos, s.investor]) {
        expect((await http().get(`${API}/payroll/entries`).set(...bearer(session))).status).toBe(403);
      }
      expect((await http().put(`${API}/payroll/settings`).set(...bearer(s.director)).send({ finePerMissedShiftTyiyn: '1', taxRatePercent: '1' })).status).toBe(403);
      expect((await http().get(`${API}/payroll/entries`).set(...bearer(s.director))).body).toHaveLength(6);
      // Удаление начисления убрано из API целиком.
      expect((await http().delete(`${API}/payroll/entries/${other.id}`).set(...bearer(s.accountant))).status).toBe(404);
      expect((await http().delete(`${API}/payroll/entries/${other.id}`).set(...bearer(s.director))).status).toBe(404);

      // Сводка по зарплате в отчётности — только директору.
      const summary = await http().get(`${API}/payroll/summary?period=${period()}`).set(...bearer(s.director));
      expect(summary.status).toBe(200);
      expect(summary.body.employeeCount).toBe(6);
      expect(summary.body.entries).toHaveLength(6);
      for (const session of [s.accountant, s.hos, s.sm1, s.investor]) {
        expect((await http().get(`${API}/payroll/summary?period=${period()}`).set(...bearer(session))).status).toBe(403);
      }

      const future = calendar.addDays(`${period()}-01`, 40).slice(0, 7);
      expect((await http().post(`${API}/payroll/entries/generate`).set(...bearer(s.accountant)).send({ period: future })).status).toBe(400);
      expect((await http().put(`${API}/payroll/settings`).set(...bearer(s.accountant)).send({ finePerMissedShiftTyiyn: '1', taxRatePercent: '150' })).status).toBe(400);
    });
  });
});
