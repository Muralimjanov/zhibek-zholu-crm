/**
 * ДЕМО-ДАННЫЕ ДЛЯ ТЕСТОВОГО СЕРВЕРА (staging) - аккаунты всех ролей и
 * несколько заведомо вымышленных бронирований/договоров, чтобы фронтенд мог
 * проверить все экраны через Swagger.
 *
 *   DEMO_SEED=true DEMO_SEED_PASSWORD='...' node dist/prisma/seed-demo.js
 *   npm run seed:demo   (локально, с теми же переменными)
 *
 * Защиты:
 * - НИКОГДА не работает при NODE_ENV=production;
 * - ничего не делает без DEMO_SEED=true (безопасно вызывать при каждом старте);
 * - работает только на полностью пустой таблице User;
 * - пароль берётся только из DEMO_SEED_PASSWORD (не короче 12 символов), не хардкодится
 *   и не выводится в лог.
 * Все данные вымышленные - не вносите сюда реальных людей.
 */
import { ConfigService } from '@nestjs/config';
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import { AppConfigService } from '../src/config/app-config.service';
import { BlindIndexService } from '../src/crypto/blind-index.service';
import { EncryptionService } from '../src/crypto/encryption.service';
import { FieldCipher } from '../src/crypto/field-cipher.service';
import { LEGAL_DOCUMENTS } from '../src/legal/legal-documents';
import { BOOKING_PII, CONTRACT_PII } from '../src/sales/buyer-pii';
import { contractTotal, parseCenti, percentOf } from '../src/common/money';
import { USER_PII } from '../src/users/users.service';

export const DEMO_USERS: Array<{ username: string; role: UserRole; fullName: string; team?: string }> = [
  { username: 'demo_director', role: UserRole.director, fullName: 'Демо Директор' },
  { username: 'demo_hos', role: UserRole.head_of_sales, fullName: 'Демо Начальник продаж' },
  { username: 'demo_manager1', role: UserRole.sales_manager, fullName: 'Демо Менеджер Один', team: 'demo_hos' },
  { username: 'demo_manager2', role: UserRole.sales_manager, fullName: 'Демо Менеджер Два', team: 'demo_hos' },
  { username: 'demo_accountant', role: UserRole.accountant, fullName: 'Демо Бухгалтер' },
  { username: 'demo_investor1', role: UserRole.investor, fullName: 'Демо Инвестор Один' },
  { username: 'demo_investor2', role: UserRole.investor, fullName: 'Демо Инвестор Два' },
];

export function demoSeedAllowed(env: NodeJS.ProcessEnv): { ok: true; password: string } | { ok: false; reason: string } {
  if (env.NODE_ENV === 'production') return { ok: false, reason: 'NODE_ENV=production - демо-данные запрещены' };
  if (env.DEMO_SEED !== 'true') return { ok: false, reason: 'DEMO_SEED не равен true - пропуск' };
  const password = env.DEMO_SEED_PASSWORD ?? '';
  if (password.length < 12) return { ok: false, reason: 'DEMO_SEED_PASSWORD должен быть не короче 12 символов' };
  return { ok: true, password };
}

async function main() {
  dotenv.config();
  const allowed = demoSeedAllowed(process.env);
  if (!allowed.ok) {
    console.log(`seed-demo: ${allowed.reason}`);
    return;
  }

  const prisma = new PrismaClient();
  try {
    if ((await prisma.user.count()) > 0) {
      console.log('seed-demo: в базе уже есть пользователи - пропуск');
      return;
    }
    const config = new AppConfigService(new ConfigService());
    const cipher = new FieldCipher(new EncryptionService(config));
    const blind = new BlindIndexService(config);
    const passwordHash = await argon2.hash(allowed.password, { type: argon2.argon2id });

    const ids: Record<string, string> = {};
    for (const u of DEMO_USERS) {
      const created = await prisma.user.create({
        data: {
          username: u.username,
          passwordHash,
          fullName: cipher.encrypt(USER_PII.fullName, u.fullName),
          role: u.role,
          teamLeadId: u.team ? ids[u.team] : undefined,
          createdById: u.team ? ids[u.team] : undefined,
        },
      });
      ids[u.username] = created.id;
      await prisma.consentRecord.createMany({
        data: (['privacy_policy', 'terms_of_use', 'personal_data_processing'] as const).map((policyType) => ({
          userId: created.id,
          policyType,
          policyVersion: LEGAL_DOCUMENTS[policyType].version,
        })),
      });
    }

    await prisma.payrollSettings.create({
      data: { id: 1, finePerMissedShiftTyiyn: 100_000n, taxRatePercent: '10', updatedById: ids.demo_accountant },
    });

    const consent = {
      buyerConsentVersion: LEGAL_DOCUMENTS.buyer_personal_data_consent.version,
      buyerConsentConfirmedAt: new Date(),
      buyerConsentRecordedById: ids.demo_manager1,
    };
    await prisma.booking.create({
      data: {
        fullNameEnc: cipher.encrypt(BOOKING_PII.fullName, 'Тестовый Покупатель Один'),
        passportNumberEnc: cipher.encrypt(BOOKING_PII.passportNumber, 'TEST0000001'),
        passportNumberIdx: blind.passport('TEST0000001'),
        phoneEnc: cipher.encrypt(BOOKING_PII.phone, '+996000000001'),
        phoneIdx: blind.phone('+996000000001'),
        desiredAreaSqm: '60',
        managerId: ids.demo_manager1,
        ...consent,
      },
    });
    const total = contractTotal(parseCenti('45.5'), 5_000_000n);
    await prisma.contract.create({
      data: {
        fullNameEnc: cipher.encrypt(CONTRACT_PII.fullName, 'Тестовый Покупатель Два'),
        passportNumberEnc: cipher.encrypt(CONTRACT_PII.passportNumber, 'TEST0000002'),
        passportNumberIdx: blind.passport('TEST0000002'),
        addressEnc: cipher.encrypt(CONTRACT_PII.address, 'г. Тестовый, ул. Вымышленная, 1'),
        phoneEnc: cipher.encrypt(CONTRACT_PII.phone, '+996000000002'),
        phoneIdx: blind.phone('+996000000002'),
        areaSqm: '45.5',
        pricePerSqmTyiyn: 5_000_000n,
        totalAmountTyiyn: total,
        depositPercent: '30',
        depositAmountTyiyn: percentOf(total, 3000n),
        managerId: ids.demo_manager2,
        ...consent,
        buyerConsentRecordedById: ids.demo_manager2,
      },
    });

    console.log(`seed-demo: созданы ${DEMO_USERS.length} демо-аккаунтов (${DEMO_USERS.map((u) => u.username).join(', ')})`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('seed-demo: ошибка:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
