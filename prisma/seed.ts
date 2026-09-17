/**
 * ОДНОРАЗОВЫЙ BOOTSTRAP ПЕРВОГО DIRECTOR-АККАУНТА.
 *
 * Это НЕ публичная регистрация и НЕ HTTP endpoint. Запускается вручную
 * (`npm run seed:director` или `npx prisma db seed`) человеком, у которого
 * уже есть доступ к базе данных/инфраструктуре.
 *
 * Безопасный по умолчанию: если в таблице User уже есть хотя бы одна
 * запись — скрипт ничего не делает и завершается с понятным сообщением.
 * Так что случайно запустить его второй раз и создать второго "первого"
 * Director-а нельзя.
 *
 * Механизм создания самого первого Director-аккаунта остаётся открытым
 * вопросом (см. OPEN_QUESTIONS.md #3 / OPEN_QUESTIONS_ADDENDUM.md) — этот
 * скрипт закрывает только практическую потребность "как мне сейчас
 * залогиниться в dev-окружении", а не финальное бизнес-решение для
 * production.
 */
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import { AppConfigService } from '../src/config/app-config.service';
import { EncryptionService } from '../src/crypto/encryption.service';
import { FieldCipher } from '../src/crypto/field-cipher.service';
import { USER_PII } from '../src/users/users.service';

const prisma = new PrismaClient();

interface SeedInput {
  username: string;
  password: string;
  fullName: string;
  email?: string;
}

/** Чистая функция без побочных эффектов - легко тестируется. */
export function shouldSeed(existingUserCount: number): boolean {
  return existingUserCount === 0;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Не задана переменная окружения ${name}. Задайте SEED_DIRECTOR_USERNAME, ` +
        `SEED_DIRECTOR_PASSWORD и SEED_DIRECTOR_FULL_NAME перед запуском seed-скрипта.`,
    );
  }
  return value;
}

function readSeedInput(): SeedInput {
  const username = readRequiredEnv('SEED_DIRECTOR_USERNAME');
  const password = readRequiredEnv('SEED_DIRECTOR_PASSWORD');
  const fullName = readRequiredEnv('SEED_DIRECTOR_FULL_NAME');
  // Optional, but strongly recommended: without an email, this first
  // Director cannot receive confirmation-code emails for account
  // creation/disable (they can still approve via
  // GET /api/v1/confirmations/pending in-app).
  const email = process.env.SEED_DIRECTOR_EMAIL || undefined;

  if (password.length < 12) {
    throw new Error('SEED_DIRECTOR_PASSWORD должен быть не короче 12 символов.');
  }

  return { username, password, fullName, email };
}

async function main() {
  const existingUserCount = await prisma.user.count();

  if (!shouldSeed(existingUserCount)) {
    // eslint-disable-next-line no-console
    console.log(
      `В базе уже есть ${existingUserCount} пользователь(ей) - seed пропущен. ` +
        `Скрипт создаёт первого Director-а только для полностью пустой базы.`,
    );
    return;
  }

  const input = readSeedInput();
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  // ФИО и email - ПД: храним зашифрованными, как UsersService.
  const cipher = new FieldCipher(new EncryptionService(new AppConfigService(new ConfigService())));

  const director = await prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      fullName: cipher.encrypt(USER_PII.fullName, input.fullName),
      email: cipher.encryptNullable(USER_PII.email, input.email),
      role: 'director',
      status: 'active',
    },
  });

  if (!input.email) {
    // eslint-disable-next-line no-console
    console.warn(
      'Внимание: SEED_DIRECTOR_EMAIL не задан. Этот Director не сможет получать ' +
        'коды подтверждения по почте, только через GET /api/v1/confirmations/pending.',
    );
  }

  // Пароль/хэш никогда не логируются - только факт создания и id/username.
  // eslint-disable-next-line no-console
  console.log(`Создан первый Director: id=${director.id} username=${director.username}`);
}

// Запускать main() только когда файл выполняется напрямую как скрипт
// (`ts-node prisma/seed.ts` / `npx prisma db seed`), а не когда он
// импортируется ради чистой функции shouldSeed (например, в тестах).
if (require.main === module) {
  dotenv.config();
  main()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Seed завершился с ошибкой:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
