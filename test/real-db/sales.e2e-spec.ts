/**
 * Sales (Booking -> Contract) against real PostgreSQL: scope isolation,
 * encryption at rest, blind-index search, money maths, status rules,
 * private file handling.
 */
import { INestApplication } from '@nestjs/common';
import { ContractStatus, PrismaClient, User, UserRole } from '@prisma/client';
import { promises as fs } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { LEGAL_DOCUMENTS } from '../../src/legal/legal-documents';
import { assertConnectedToTestDatabase } from './guard';
import { API, Session, bearer, createApp, login, seedUser, truncateAll } from './harness';

assertConnectedToTestDatabase();

const BUYER_CONSENT = { buyerConsentConfirmed: true, buyerConsentVersion: LEGAL_DOCUMENTS.buyer_personal_data_consent.version };
const bigintSafe = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a70000000049454e44ae426082', 'hex');


// Business-rule suite: step-up email codes are covered by email-codes.e2e-spec.ts.
// Login still goes through the real emailed code.
process.env.TEST_BYPASS_ACTION_EMAIL_CODE = 'true';

describe('Sales — real PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());

  let director: User, hosA: User, hosB: User, smA1: User, smA2: User, smB: User, accountant: User, investor: User;
  let s: Record<'director' | 'hosA' | 'hosB' | 'smA1' | 'smA2' | 'smB' | 'accountant' | 'investor', Session>;

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
    director = await seedUser(prisma, { role: UserRole.director });
    hosA = await seedUser(prisma, { role: UserRole.head_of_sales });
    hosB = await seedUser(prisma, { role: UserRole.head_of_sales });
    smA1 = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hosA.id, createdById: hosA.id });
    smA2 = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hosA.id, createdById: hosA.id });
    smB = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hosB.id, createdById: hosB.id });
    accountant = await seedUser(prisma, { role: UserRole.accountant });
    investor = await seedUser(prisma, { role: UserRole.investor });
    s = {
      director: await login(app, director.username),
      hosA: await login(app, hosA.username),
      hosB: await login(app, hosB.username),
      smA1: await login(app, smA1.username),
      smA2: await login(app, smA2.username),
      smB: await login(app, smB.username),
      accountant: await login(app, accountant.username),
      investor: await login(app, investor.username),
    };
  });

  const bookingBody = (overrides: Record<string, unknown> = {}) => ({
    fullName: 'Асанов Бакыт',
    passportNumber: 'ID 1234567',
    phone: '+996 555 12-34-56',
    email: 'bakyt@example.com',
    desiredAreaSqm: '60',
    ...BUYER_CONSENT,
    ...overrides,
  });

  async function createBooking(session: Session, overrides: Record<string, unknown> = {}) {
    const res = await http().post(`${API}/bookings`).set(...bearer(session)).send(bookingBody(overrides));
    expect(res.status).toBe(201);
    return res.body as { id: string; managerId: string };
  }

  describe('Booking', () => {
    it('stores buyer PII encrypted at rest and returns it decrypted to the owner', async () => {
      const booking = await createBooking(s.smA1);
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      const raw = JSON.stringify(row);
      for (const plain of ['Асанов', '1234567', '12-34-56', 'bakyt@example.com']) expect(raw).not.toContain(plain);
      expect(row.passportNumberEnc).toMatch(/^enc:v1:/);
      expect(row.passportNumberIdx).toMatch(/^bi1:[0-9a-f]{64}$/);

      const detail = await http().get(`${API}/bookings/${booking.id}`).set(...bearer(s.smA1));
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({
        fullName: 'Асанов Бакыт',
        passportNumber: 'ID 1234567',
        phone: '+996 555 12-34-56',
        managerId: smA1.id,
        status: 'active',
        desiredAreaSqm: '60.00',
      });
      expect(await prisma.auditEvent.count({ where: { action: 'PII_ACCESSED', entityId: booking.id } })).toBe(1);
    });

    it('requires the buyer consent for the current form version', async () => {
      for (const bad of [
        { buyerConsentConfirmed: false },
        { buyerConsentConfirmed: undefined },
        { buyerConsentVersion: '2000-01-01' },
      ]) {
        const res = await http().post(`${API}/bookings`).set(...bearer(s.smA1)).send(bookingBody(bad));
        expect(res.status).toBe(400);
      }
      expect(await prisma.booking.count()).toBe(0);
    });

    it('scope: manager sees only own; head of sales sees team; other team gets 404; director sees all', async () => {
      const a1 = await createBooking(s.smA1);
      const a2 = await createBooking(s.smA2, { passportNumber: 'AN7654321' });
      const b = await createBooking(s.smB, { passportNumber: 'AN1111111' });

      const ids = async (session: Session) =>
        ((await http().get(`${API}/bookings`).set(...bearer(session))).body.items as Array<{ id: string }>).map((i) => i.id).sort();

      expect(await ids(s.smA1)).toEqual([a1.id]);
      expect(await ids(s.hosA)).toEqual([a1.id, a2.id].sort());
      expect(await ids(s.hosB)).toEqual([b.id]);
      expect(await ids(s.director)).toEqual([a1.id, a2.id, b.id].sort());

      // IDOR: guessing another team's id looks exactly like a missing record.
      for (const [session, id] of [[s.smA1, a2.id], [s.smB, a1.id], [s.hosB, a1.id]] as const) {
        expect((await http().get(`${API}/bookings/${id}`).set(...bearer(session))).status).toBe(404);
        expect((await http().patch(`${API}/bookings/${id}`).set(...bearer(session)).send({ fullName: 'Hacked' })).status).toBe(404);
      }
      // Filtering by another manager id cannot widen the scope.
      const widened = await http().get(`${API}/bookings?managerId=${smB.id}`).set(...bearer(s.smA1));
      expect(widened.body.items).toHaveLength(0);
    });

    it('accountant and investor have no access to bookings', async () => {
      for (const session of [s.accountant, s.investor]) {
        expect((await http().get(`${API}/bookings`).set(...bearer(session))).status).toBe(403);
        expect((await http().post(`${API}/bookings`).set(...bearer(session)).send(bookingBody())).status).toBe(403);
      }
    });

    it('list masks the passport; exact search via blind index matches format variants', async () => {
      await createBooking(s.smA1, { passportNumber: 'AN 123-4567' });
      await createBooking(s.smA1, { passportNumber: 'AN9999999', phone: '0700111222' });

      const list = await http().get(`${API}/bookings`).set(...bearer(s.smA1));
      for (const item of list.body.items) expect(item.passportNumber).toMatch(/^\*+\d{4}$/);

      const byPassport = await http().get(`${API}/bookings?passportNumber=an1234567`).set(...bearer(s.smA1));
      expect(byPassport.body.items).toHaveLength(1);
      const byPhone = await http().get(`${API}/bookings`).query({ phone: '+996 700 111 222' }).set(...bearer(s.smA1));
      expect(byPhone.body.items).toHaveLength(1);
      expect(await prisma.auditEvent.count({ where: { action: 'PII_ACCESSED' } })).toBe(2);

      // Injection-shaped input is rejected by validation, never reaches a query.
      const evil = await http().get(`${API}/bookings`).query({ passportNumber: "' OR 1=1 --" }).set(...bearer(s.smA1));
      expect(evil.status).toBe(400);
    });

    it('manager cannot assign bookings to someone else or delete; only the head of sales can', async () => {
      expect((await http().post(`${API}/bookings`).set(...bearer(s.smA1)).send(bookingBody({ managerId: smA2.id }))).status).toBe(403);
      expect((await http().post(`${API}/bookings`).set(...bearer(s.hosA)).send(bookingBody({ managerId: smB.id }))).status).toBe(403);
      // Решение владельца 22.09.2026: у директора нет никакого редактирования.
      expect((await http().post(`${API}/bookings`).set(...bearer(s.director)).send(bookingBody())).status).toBe(403);

      const booking = await createBooking(s.smA1);
      expect((await http().delete(`${API}/bookings/${booking.id}`).set(...bearer(s.smA1))).status).toBe(403);
      expect((await http().delete(`${API}/bookings/${booking.id}`).set(...bearer(s.director))).status).toBe(403);
      expect((await http().delete(`${API}/bookings/${booking.id}`).set(...bearer(s.hosB))).status).toBe(404);
      expect((await http().delete(`${API}/bookings/${booking.id}`).set(...bearer(s.hosA))).status).toBe(204);
      expect(await prisma.booking.count()).toBe(0);
    });

    it('rejects non-UUID ids and unknown fields', async () => {
      expect((await http().get(`${API}/bookings/not-a-uuid`).set(...bearer(s.smA1))).status).toBe(400);
      const res = await http().post(`${API}/bookings`).set(...bearer(s.smA1)).send(bookingBody({ status: 'converted' }));
      expect(res.status).toBe(400);
    });
  });

  describe('Contract', () => {
    it('convert booking -> contract: TZ example 60 m² × 50 000 KGS = 3 000 000, deposit 30% = 900 000', async () => {
      const booking = await createBooking(s.smA1);
      const res = await http()
        .post(`${API}/bookings/${booking.id}/convert`)
        .set(...bearer(s.smA1))
        .send({ address: 'г. Ош, ул. Ленина 1', pricePerSqmTyiyn: '5000000', ...BUYER_CONSENT });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        bookingId: booking.id,
        fullName: 'Асанов Бакыт',
        address: 'г. Ош, ул. Ленина 1',
        areaSqm: '60.00',
        totalAmountTyiyn: '300000000',
        depositPercent: '30.00',
        depositAmountTyiyn: '90000000',
        status: 'draft',
        managerId: smA1.id,
      });
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('converted');

      const row = await prisma.contract.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(JSON.stringify(row, bigintSafe)).not.toContain('Ленина');

      const again = await http()
        .post(`${API}/bookings/${booking.id}/convert`)
        .set(...bearer(s.smA1))
        .send({ address: 'x', pricePerSqmTyiyn: '1', ...BUYER_CONSENT });
      expect(again.status).toBe(409);
    });

    it('concurrent conversions of one booking create exactly one contract', async () => {
      const booking = await createBooking(s.smA1);
      const results = await Promise.all(
        [s.smA1, s.hosA, s.smA1].map((session) =>
          http()
            .post(`${API}/bookings/${booking.id}/convert`)
            .set(...bearer(session))
            .send({ address: 'Адрес', pricePerSqmTyiyn: '100', ...BUYER_CONSENT }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      expect(await prisma.contract.count()).toBe(1);
    });

    async function createContract(session: Session, overrides: Record<string, unknown> = {}) {
      const res = await http()
        .post(`${API}/contracts`)
        .set(...bearer(session))
        .send({
          fullName: 'Кадырова Айжан',
          passportNumber: 'AN5555555',
          address: 'г. Бишкек',
          phone: '+996700000001',
          areaSqm: '45.5',
          pricePerSqmTyiyn: '4500000',
          ...BUYER_CONSENT,
          ...overrides,
        });
      expect(res.status).toBe(201);
      return res.body as { id: string };
    }

    it('direct contract: managerId rule per role (director forbidden, head of sales optional within team, manager self only)', async () => {
      const body = (managerId?: string) => ({
        fullName: 'Асанов Бакыт',
        passportNumber: 'ID 1234567',
        phone: '+996 555 12-34-56',
        address: 'г. Ош, ул. Ленина 1',
        areaSqm: '10',
        pricePerSqmTyiyn: '100',
        ...BUYER_CONSENT,
        ...(managerId ? { managerId } : {}),
      });
      const post = (session: Session, managerId?: string) => http().post(`${API}/contracts`).set(...bearer(session)).send(body(managerId));

      // Директор договоры больше не заводит (решение владельца 22.09.2026).
      expect((await post(s.director)).status).toBe(403);
      expect((await post(s.director, smB.id)).status).toBe(403);

      // Head of sales: defaults to self; own team allowed; another team forbidden.
      expect((await post(s.hosA)).body.managerId).toBe(hosA.id);
      expect((await post(s.hosA, smA2.id)).body.managerId).toBe(smA2.id);
      expect((await post(s.hosA, smB.id)).status).toBe(403);

      // Sales manager: always self; own id accepted, anyone else forbidden.
      expect((await post(s.smA1)).body.managerId).toBe(smA1.id);
      expect((await post(s.smA1, smA1.id)).body.managerId).toBe(smA1.id);
      expect((await post(s.smA1, smA2.id)).status).toBe(403);

      // Swagger documents the rule on the field.
      const doc = await http().get(`${API}/docs-json`);
      const schema = doc.body.components.schemas.CreateContractDto;
      expect(schema.properties.managerId.description).toContain('MANAGER_ID_REQUIRED');
      expect(schema.required ?? []).not.toContain('managerId');
    });

    it('amounts are always computed server-side; client totals are rejected; overflow is a 400', async () => {
      const contract = await createContract(s.smA1, { depositPercent: '25' });
      const row = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      expect(row.totalAmountTyiyn).toBe(204_750_000n);
      expect(row.depositAmountTyiyn).toBe(51_187_500n);

      const smuggled = await http().patch(`${API}/contracts/${contract.id}`).set(...bearer(s.smA1)).send({ totalAmountTyiyn: '1' });
      expect(smuggled.status).toBe(400);

      const updated = await http().patch(`${API}/contracts/${contract.id}`).set(...bearer(s.smA1)).send({ areaSqm: '50' });
      expect(updated.body).toMatchObject({ totalAmountTyiyn: '225000000', depositAmountTyiyn: '56250000' });

      const overflow = await http()
        .patch(`${API}/contracts/${contract.id}`)
        .set(...bearer(s.smA1))
        .send({ areaSqm: '9999999999.99', pricePerSqmTyiyn: '9999999999999999' });
      expect(overflow.status).toBe(400);
      expect(overflow.body.message).toBe('AMOUNT_OUT_OF_RANGE');

      const badPercent = await http().patch(`${API}/contracts/${contract.id}`).set(...bearer(s.smA1)).send({ depositPercent: '101' });
      expect(badPercent.status).toBe(400);
    });

    it('status: deposit paid -> deposit_paid; + contract file -> signed; then read-only for the manager', async () => {
      const contract = await createContract(s.smA1);

      const paid = await http().post(`${API}/contracts/${contract.id}/deposit`).set(...bearer(s.smA1)).send({ paid: true });
      expect(paid.body).toMatchObject({ depositPaid: true, status: ContractStatus.deposit_paid });

      const uploaded = await http()
        .put(`${API}/contracts/${contract.id}/file`)
        .set(...bearer(s.smA1))
        .attach('file', PDF, { filename: '../../etc/passwd.pdf', contentType: 'application/pdf' });
      expect(uploaded.status).toBe(200);
      expect(uploaded.body).toMatchObject({ status: ContractStatus.signed, hasFile: true });

      expect((await http().patch(`${API}/contracts/${contract.id}`).set(...bearer(s.smA1)).send({ address: 'x' })).status).toBe(403);
      expect((await http().post(`${API}/contracts/${contract.id}/deposit`).set(...bearer(s.smA1)).send({ paid: false })).status).toBe(403);
      // Head of sales (team) can still correct it.
      expect((await http().patch(`${API}/contracts/${contract.id}`).set(...bearer(s.hosA)).send({ address: 'Новый адрес' })).status).toBe(200);
    });

    it('accountant marks payment on a finance-only view without buyer PII and cannot search by PII', async () => {
      const contract = await createContract(s.smA1);
      const list = await http().get(`${API}/contracts`).set(...bearer(s.accountant));
      expect(list.status).toBe(200);
      const text = JSON.stringify(list.body);
      for (const pii of ['Кадырова', 'AN5555555', '700000001', 'Бишкек', 'fullName', 'passportNumber']) {
        expect(text).not.toContain(pii);
      }
      const marked = await http().post(`${API}/contracts/${contract.id}/deposit`).set(...bearer(s.accountant)).send({ paid: true });
      expect(marked.status).toBe(201);
      expect(marked.body).not.toHaveProperty('fullName');
      expect((await http().get(`${API}/contracts?passportNumber=AN5555555`).set(...bearer(s.accountant))).status).toBe(403);
      expect((await http().get(`${API}/contracts/${contract.id}/file`).set(...bearer(s.accountant))).status).toBe(403);

      expect((await http().get(`${API}/contracts`).set(...bearer(s.investor))).status).toBe(403);
    });

    it('files: type is detected from content, bytes are encrypted on disk, download is private and scoped', async () => {
      const contract = await createContract(s.smA1);

      const disguisedHtml = await http()
        .put(`${API}/contracts/${contract.id}/file`)
        .set(...bearer(s.smA1))
        .attach('file', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'contract.pdf', contentType: 'application/pdf' });
      expect(disguisedHtml.status).toBe(400);
      expect(disguisedHtml.body.message).toBe('FILE_TYPE_NOT_ALLOWED');

      const svg = await http()
        .put(`${API}/contracts/${contract.id}/file`)
        .set(...bearer(s.smA1))
        .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), { filename: 'a.png', contentType: 'image/png' });
      expect(svg.status).toBe(400);

      const tooBig = await http()
        .put(`${API}/contracts/${contract.id}/file`)
        .set(...bearer(s.smA1))
        .attach('file', Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]), { filename: 'big.pdf' });
      expect(tooBig.status).toBe(413);

      const ok = await http().put(`${API}/contracts/${contract.id}/file`).set(...bearer(s.smA1)).attach('file', PNG, 'scan.png');
      expect(ok.status).toBe(200);

      const stored = await prisma.storedFile.findFirstOrThrow();
      expect(stored.mimeType).toBe('image/png');
      const onDisk = await fs.readFile(join(process.env.FILE_STORAGE_DIR!, stored.storageKey));
      expect(onDisk.includes(PNG.subarray(0, 8))).toBe(false);
      expect(JSON.stringify(stored)).not.toContain('scan.png');

      const download = await http().get(`${API}/contracts/${contract.id}/file`).set(...bearer(s.hosA)).buffer(true);
      expect(download.status).toBe(200);
      expect(Buffer.compare(download.body as Buffer, PNG)).toBe(0);
      expect(download.headers['content-type']).toBe('image/png');
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      expect(download.headers['content-security-policy']).toContain('sandbox');
      expect(download.headers['cache-control']).toContain('no-store');
      expect(download.headers['content-disposition']).toMatch(/^attachment; filename="contract-[0-9a-f-]+\.png"$/);

      expect((await http().get(`${API}/contracts/${contract.id}/file`).set(...bearer(s.smB))).status).toBe(404);
      expect(await prisma.auditEvent.count({ where: { action: 'FILE_DOWNLOADED' } })).toBe(1);

      // Replacing the file removes the previous encrypted blob.
      await http().put(`${API}/contracts/${contract.id}/file`).set(...bearer(s.smA1)).attach('file', PDF, 'v2.pdf').expect(200);
      expect(await prisma.storedFile.count()).toBe(1);
      await expect(fs.stat(join(process.env.FILE_STORAGE_DIR!, stored.storageKey))).rejects.toThrow();
    });

    it('tampering with an encrypted file on disk is detected, not served', async () => {
      const contract = await createContract(s.smA1);
      await http().put(`${API}/contracts/${contract.id}/file`).set(...bearer(s.smA1)).attach('file', PDF, 'c.pdf').expect(200);
      const stored = await prisma.storedFile.findFirstOrThrow();
      const path = join(process.env.FILE_STORAGE_DIR!, stored.storageKey);
      const bytes = await fs.readFile(path);
      bytes[0] ^= 0xff;
      await fs.writeFile(path, bytes);

      const res = await http().get(`${API}/contracts/${contract.id}/file`).set(...bearer(s.smA1));
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/stack|decipher|auth/i);
    });

    it('database constraints reject impossible states even if application checks were bypassed', async () => {
      const contract = await createContract(s.smA1);
      await expect(
        prisma.contract.update({ where: { id: contract.id }, data: { status: ContractStatus.signed } }),
      ).rejects.toThrow();
      await expect(prisma.contract.update({ where: { id: contract.id }, data: { totalAmountTyiyn: -1n } })).rejects.toThrow();
    });

    it('delete: head of sales only; the encrypted file is removed too', async () => {
      const contract = await createContract(s.smA1);
      await http().put(`${API}/contracts/${contract.id}/file`).set(...bearer(s.smA1)).attach('file', PDF, 'c.pdf').expect(200);
      expect((await http().delete(`${API}/contracts/${contract.id}`).set(...bearer(s.smA1))).status).toBe(403);
      expect((await http().delete(`${API}/contracts/${contract.id}`).set(...bearer(s.director))).status).toBe(403);
      expect((await http().delete(`${API}/contracts/${contract.id}`).set(...bearer(s.hosA))).status).toBe(204);
      expect(await prisma.storedFile.count()).toBe(0);
    });
  });
});
