/**
 * The account-removal ops script against real PostgreSQL: it must take the
 * users' data with them, never touch directors, and keep the audit trail.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { collectTargets, deleteUsers, parseArgs } from '../../prisma/ops-delete-users';
import { BusinessCalendar } from '../../src/common/business-calendar.service';
import { LEGAL_DOCUMENTS } from '../../src/legal/legal-documents';
import { assertConnectedToTestDatabase } from './guard';
import { API, bearer, createApp, login, seedUser, truncateAll } from './harness';

assertConnectedToTestDatabase();

const BUYER_CONSENT = { buyerConsentConfirmed: true, buyerConsentVersion: LEGAL_DOCUMENTS.buyer_personal_data_consent.version };
process.env.TEST_BYPASS_ACTION_EMAIL_CODE = 'true';

describe('ops:delete-users — real PostgreSQL', () => {
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

  it('removes the users with their data, keeps directors and the audit log', async () => {
    const calendar = app.get(BusinessCalendar);
    const director = await seedUser(prisma, { role: UserRole.director });
    const hos = await seedUser(prisma, { role: UserRole.head_of_sales, createdById: director.id });
    const manager = await seedUser(prisma, { role: UserRole.sales_manager, createdById: hos.id, teamLeadId: hos.id });
    const accountant = await seedUser(prisma, { role: UserRole.accountant, createdById: director.id });
    const investor = await seedUser(prisma, { role: UserRole.investor, createdById: director.id });
    const sManager = await login(app, manager.username);
    const sAccountant = await login(app, accountant.username);

    // Real data created through the API, including a contract file and a receipt.
    const booking = await http()
      .post(`${API}/bookings`)
      .set(...bearer(sManager))
      .send({ fullName: 'Тестов Покупатель', passportNumber: 'AN 7654321', phone: '+996555111222', desiredAreaSqm: '40', ...BUYER_CONSENT });
    const contract = await http()
      .post(`${API}/bookings/${booking.body.id}/convert`)
      .set(...bearer(sManager))
      .send({ address: 'г. Ош, ул. Тестовая 1', pricePerSqmTyiyn: '1000000', ...BUYER_CONSENT });
    await http().put(`${API}/contracts/${contract.body.id}/file`).set(...bearer(sManager)).attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), 'c.pdf').expect(200);
    await http().post(`${API}/shifts/open`).set(...bearer(sManager)).expect(201);
    const tx = await http()
      .post(`${API}/transactions`)
      .set(...bearer(sAccountant))
      .send({ type: 'income', category: 'sale_deposit', amountTyiyn: '1000', date: calendar.today(), relatedContractId: contract.body.id });
    await http().put(`${API}/transactions/${tx.body.id}/attachment`).set(...bearer(sAccountant)).attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), 'r.pdf').expect(200);
    await http().put(`${API}/payroll/settings`).set(...bearer(sAccountant)).send({ finePerMissedShiftTyiyn: '1000', taxRatePercent: '10' }).expect(200);
    await http().post(`${API}/payroll/entries/generate`).set(...bearer(sAccountant)).send({ period: calendar.today().slice(0, 7) }).expect(200);

    const auditBefore = await prisma.auditEvent.count();
    expect(auditBefore).toBeGreaterThan(0);

    // Dry run lists exactly the four non-director accounts.
    const targets = await collectTargets(prisma, parseArgs([]));
    expect(targets.map((t) => t.username).sort()).toEqual([hos.username, manager.username, accountant.username, investor.username].sort());
    expect(targets.find((t) => t.username === manager.username)?.counts).toMatchObject({ bookings: 1, contracts: 1, shifts: 1, files: 1 });
    expect(await prisma.user.count()).toBe(5); // nothing deleted by the dry run

    const removed = await deleteUsers(prisma, targets.map((t) => t.id), process.env.FILE_STORAGE_DIR ?? './storage');
    expect(removed).toMatchObject({ users: 4, bookings: 1, contracts: 1, shifts: 1, transactions: 1, payrollEntries: 3 });

    // Only the director is left, with everything of the others gone.
    const left = await prisma.user.findMany();
    expect(left.map((u) => u.id)).toEqual([director.id]);
    for (const count of [prisma.booking.count(), prisma.contract.count(), prisma.shift.count(), prisma.transaction.count(), prisma.storedFile.count(), prisma.payrollEntry.count()]) {
      expect(await count).toBe(0);
    }
    // The audit log survives; entries of deleted users lose the actor link only.
    expect(await prisma.auditEvent.count()).toBe(auditBefore);
    expect(await prisma.auditEvent.count({ where: { actorUserId: { in: [hos.id, manager.id, accountant.id, investor.id] } } })).toBe(0);
    // The director can still sign in and use the API.
    const session = await login(app, director.username);
    expect((await http().get(`${API}/users`).set(...bearer(session))).body).toHaveLength(1);
  });

  it('never deletes a director, even when asked by username', async () => {
    const director = await seedUser(prisma, { role: UserRole.director });
    const targets = await collectTargets(prisma, parseArgs(['--usernames', director.username]));
    expect(targets).toEqual([]);
    expect(() => parseArgs(['--roles', 'director'])).toThrow();
    expect(await prisma.user.count()).toBe(1);
  });
});
