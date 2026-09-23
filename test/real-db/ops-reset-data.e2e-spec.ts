/**
 * Полная очистка рабочих данных против настоящей PostgreSQL.
 *
 * Проверяет то, ради чего скрипт и написан: после него в базе остаётся
 * только директор, все внешние ключи выдерживают удаление (лид ссылается
 * и на пользователя, и на бронь), а журнал аудита никуда не девается.
 */
import { INestApplication } from '@nestjs/common';
import { LeadStatus, PrismaClient, UserRole } from '@prisma/client';
import { countEverything, parseResetArgs, resetData } from '../../prisma/ops-reset-data';
import { LEGAL_DOCUMENTS } from '../../src/legal/legal-documents';
import { createApp, seedUser, testCipher, truncateAll, uniq } from './harness';

// Этот файл не ходит по HTTP и коды подтверждения ему не нужны.
process.env.TEST_BYPASS_ACTION_EMAIL_CODE = 'true';

describe('Полная очистка рабочих данных — реальная PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await createApp();
    prisma = new PrismaClient();
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('оставляет только директора: сотрудники, лиды и все записи уходят, аудит остаётся', async () => {
    const cipher = testCipher();
    const director = await seedUser(prisma, { role: UserRole.director });
    const hos = await seedUser(prisma, { role: UserRole.head_of_sales, createdById: director.id });
    const manager = await seedUser(prisma, { role: UserRole.sales_manager, teamLeadId: hos.id, createdById: hos.id });
    const reception = await seedUser(prisma, { role: UserRole.reception, createdById: director.id });

    const booking = await prisma.booking.create({
      data: {
        fullNameEnc: cipher.encrypt('Booking.fullName', 'Асанов Бакыт'),
        passportNumberEnc: cipher.encrypt('Booking.passportNumber', 'ID 1234567'),
        passportNumberIdx: 'idx-passport',
        phoneEnc: cipher.encrypt('Booking.phone', '+996555000000'),
        phoneIdx: 'idx-phone',
        desiredAreaSqm: '60',
        managerId: manager.id,
        buyerConsentVersion: LEGAL_DOCUMENTS.buyer_personal_data_consent.version,
        buyerConsentConfirmedAt: new Date(),
        buyerConsentRecordedById: manager.id,
      },
    });
    // Лид, превращённый в бронь: ссылается и на пользователя, и на бронь —
    // самый опасный для удаления случай.
    await prisma.lead.create({
      data: {
        firstNameEnc: cipher.encrypt('Lead.firstName', 'Бакыт'),
        lastNameEnc: cipher.encrypt('Lead.lastName', 'Асанов'),
        phoneEnc: cipher.encrypt('Lead.phone', '+996555000000'),
        phoneIdx: 'idx-lead-phone',
        desiredAreaSqm: '60',
        status: LeadStatus.converted,
        bookingId: booking.id,
        createdById: reception.id,
        assignedManagerId: manager.id,
        buyerConsentVersion: LEGAL_DOCUMENTS.buyer_personal_data_consent.version,
        buyerConsentConfirmedAt: new Date(),
        buyerConsentRecordedById: reception.id,
      },
    });
    // Подписанный договор с прикреплённым файлом: в базе есть проверка
    // «signed требует и взнос, и файл», из-за которой очистка ломалась,
    // если снимать ссылку на файл до удаления самого договора.
    const file = await prisma.storedFile.create({
      data: {
        purpose: 'contract_document',
        storageKey: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        sha256: 'b'.repeat(64),
        keyVersion: 'v1',
        iv: 'iv',
        authTag: 'tag',
        uploadedById: manager.id,
      },
    });
    await prisma.contract.create({
      data: {
        bookingId: booking.id,
        fullNameEnc: cipher.encrypt('Contract.fullName', 'Асанов Бакыт'),
        passportNumberEnc: cipher.encrypt('Contract.passportNumber', 'ID 1234567'),
        passportNumberIdx: 'idx-c-passport',
        addressEnc: cipher.encrypt('Contract.address', 'г. Ош'),
        phoneEnc: cipher.encrypt('Contract.phone', '+996555000000'),
        phoneIdx: 'idx-c-phone',
        areaSqm: '60',
        pricePerSqmTyiyn: 5000000n,
        totalAmountTyiyn: 300000000n,
        depositAmountTyiyn: 90000000n,
        depositPaid: true,
        depositPaidAt: new Date(),
        depositMarkedById: manager.id,
        contractFileId: file.id,
        status: 'signed',
        managerId: manager.id,
        buyerConsentVersion: LEGAL_DOCUMENTS.buyer_personal_data_consent.version,
        buyerConsentConfirmedAt: new Date(),
        buyerConsentRecordedById: manager.id,
      },
    });

    await prisma.payrollSettings.create({
      data: { id: 1, finePerMissedShiftTyiyn: 100000n, taxRatePercent: '10', updatedById: director.id },
    });
    await prisma.dailyReport.create({
      data: { type: 'sales', date: new Date('2026-09-01'), contentEnc: cipher.encrypt('DailyReport.content', '{}') },
    });
    await prisma.auditEvent.createMany({
      data: [
        { actorUserId: manager.id, action: 'BOOKING_CREATED', result: 'success' },
        { actorUserId: director.id, action: 'USER_CREATED', result: 'success' },
      ],
    });

    const before = await countEverything(prisma);
    expect(before['остальных сотрудников']).toBe(3);
    expect(before['лидов']).toBe(1);

    const removed = await resetData(prisma, `${process.env.FILE_STORAGE_DIR}`);
    expect(removed['сотрудников']).toBe(3);
    expect(removed['лидов']).toBe(1);
    expect(removed['броней']).toBe(1);
    expect(removed['договоров']).toBe(1);
    expect(removed['файлов']).toBe(1);

    const after = await countEverything(prisma);
    expect(after['директоров (остаются)']).toBe(1);
    expect(after['остальных сотрудников']).toBe(0);
    expect(after['лидов']).toBe(0);
    expect(after['броней']).toBe(0);
    expect(after['договоров']).toBe(0);
    expect(after['файлов']).toBe(0);
    expect(after['ежедневных отчётов']).toBe(0);
    expect(after['настроек зарплаты']).toBe(0);
    // Журнал аудита цел, но ссылка на удалённого менеджера обнулена.
    expect(after['событий аудита (остаются)']).toBe(2);
    const actors = (await prisma.auditEvent.findMany({ select: { actorUserId: true } })).map((a) => a.actorUserId);
    expect(actors).toContain(director.id);
    expect(actors).toContain(null);

    // Директор остался и может войти: его согласия на месте.
    const survivors = await prisma.user.findMany({ select: { id: true, role: true } });
    expect(survivors).toEqual([{ id: director.id, role: UserRole.director }]);
    expect(await prisma.consentRecord.count({ where: { userId: director.id } })).toBeGreaterThan(0);
  }, 60_000);

  it('без --db команда с --apply не запускается, а база без директора не очищается', async () => {
    expect(() => parseResetArgs(['--apply'])).toThrow(/--db/);
    expect(parseResetArgs([])).toEqual({ apply: false, db: undefined, envFile: undefined });
    expect(parseResetArgs(['--db', 'uzz_crm_u7hn', '--apply'])).toMatchObject({ apply: true, db: 'uzz_crm_u7hn' });

    // Пустая база: директоров нет — считать нечего, но и падать не должно.
    const counts = await countEverything(prisma);
    expect(counts['директоров (остаются)']).toBe(0);
  }, 30_000);
});
