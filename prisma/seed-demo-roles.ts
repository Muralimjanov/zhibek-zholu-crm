/**
 * Наполняет ТЕСТОВУЮ базу аккаунтами всех ролей, чтобы вручную посмотреть
 * интерфейс. Никогда не трогает рабочую базу: адрес берётся только из
 * DATABASE_URL_TEST и имя базы обязано заканчиваться на `_test`.
 *
 *   npm run seed:demo-roles
 *
 * Пароль у всех — DEMO_PASSWORD (по умолчанию `Correct-Horse-Battery-9`).
 * Коды входа уходят в локальный Mailpit.
 */
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import { AppConfigService } from '../src/config/app-config.service';
import { EncryptionService } from '../src/crypto/encryption.service';
import { FieldCipher } from '../src/crypto/field-cipher.service';
import { LEGAL_DOCUMENTS } from '../src/legal/legal-documents';
import { USER_PII } from '../src/users/users.service';

const REQUIRED_CONSENTS = ['privacy_policy', 'terms_of_use', 'personal_data_processing'] as const;

interface Person {
  username: string;
  fullName: string;
  role: UserRole;
}

const PEOPLE: Person[] = [
  { username: 'demo_director', fullName: 'Директоров Директор', role: UserRole.director },
  { username: 'demo_hos', fullName: 'Начальников Начальник', role: UserRole.head_of_sales },
  { username: 'demo_manager', fullName: 'Менеджеров Менеджер', role: UserRole.sales_manager },
  { username: 'demo_accountant', fullName: 'Бухгалтеров Бухгалтер', role: UserRole.accountant },
  { username: 'demo_reception', fullName: 'Ресепшенова Ресепшен', role: UserRole.reception },
];

async function main() {
  dotenv.config();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST не задан — отказываюсь угадывать базу.');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) throw new Error(`База "${name}" не оканчивается на _test — это не тестовая база.`);
  process.env.DATABASE_URL = url;

  const password = process.env.DEMO_PASSWORD ?? 'Correct-Horse-Battery-9';
  const cipher = new FieldCipher(new EncryptionService(new AppConfigService(new ConfigService())));
  const prisma = new PrismaClient();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  try {
    let teamLeadId: string | undefined;
    for (const person of PEOPLE) {
      const existing = await prisma.user.findUnique({ where: { username: person.username } });
      if (existing) {
        if (person.role === UserRole.head_of_sales) teamLeadId = existing.id;
        console.log(`  = ${person.username} уже есть`);
        continue;
      }
      const user = await prisma.user.create({
        data: {
          username: person.username,
          passwordHash,
          fullName: cipher.encrypt(USER_PII.fullName, person.fullName),
          email: cipher.encrypt(USER_PII.email, `${person.username}@demo.test`),
          role: person.role,
          status: UserStatus.active,
          teamLeadId: person.role === UserRole.sales_manager ? teamLeadId : undefined,
        },
      });
      if (person.role === UserRole.head_of_sales) teamLeadId = user.id;
      await prisma.consentRecord.createMany({
        data: REQUIRED_CONSENTS.map((policyType) => ({
          userId: user.id,
          policyType,
          policyVersion: LEGAL_DOCUMENTS[policyType].version,
        })),
      });
      console.log(`  + ${person.username} (${person.role})`);
    }
    console.log(`\nБаза: ${name}. Пароль у всех: ${password}. Коды входа — в Mailpit.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('seed-demo-roles:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
