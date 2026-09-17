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
  email: string;
}

/** Чистая функция без побочных эффектов - легко тестируется. */
export function shouldSeed(existingUserCount: number): boolean {
  return existingUserCount === 0;
}

const SEED_ENV = ['SEED_DIRECTOR_USERNAME', 'SEED_DIRECTOR_PASSWORD', 'SEED_DIRECTOR_FULL_NAME', 'SEED_DIRECTOR_EMAIL'] as const;

/** null = no variable set at all (nothing to do); throws on a partial/invalid set. */
export function readSeedInput(env: NodeJS.ProcessEnv): SeedInput | null {
  const present = SEED_ENV.filter((name) => Boolean(env[name]));
  if (present.length === 0) return null;
  const missing = SEED_ENV.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Не заданы переменные: ${missing.join(', ')}. Нужны все: ${SEED_ENV.join(', ')}.`);
  }
  const input = {
    username: env.SEED_DIRECTOR_USERNAME as string,
    password: env.SEED_DIRECTOR_PASSWORD as string,
    fullName: env.SEED_DIRECTOR_FULL_NAME as string,
    // Обязателен: вход в CRM подтверждается кодом, который приходит на этот email.
    email: (env.SEED_DIRECTOR_EMAIL as string).trim().toLowerCase(),
  };
  if (input.password.length < 12) {
    throw new Error('SEED_DIRECTOR_PASSWORD должен быть не короче 12 символов.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    throw new Error('SEED_DIRECTOR_EMAIL должен быть настоящим адресом почты.');
  }
  return input;
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

  const input = readSeedInput(process.env);
  if (!input) {
    // eslint-disable-next-line no-console
    console.warn(
      'База пуста, но SEED_DIRECTOR_* не заданы - первый Director не создан. ' +
        'Задайте SEED_DIRECTOR_USERNAME, SEED_DIRECTOR_PASSWORD, SEED_DIRECTOR_FULL_NAME, SEED_DIRECTOR_EMAIL и перезапустите.',
    );
    return;
  }
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  // ФИО и email - ПД: храним зашифрованными, как UsersService.
  const cipher = new FieldCipher(new EncryptionService(new AppConfigService(new ConfigService())));

  const director = await prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      fullName: cipher.encrypt(USER_PII.fullName, input.fullName),
      email: cipher.encrypt(USER_PII.email, input.email),
      role: 'director',
      status: 'active',
    },
  });

  // Пароль/хэш никогда не логируются - только факт создания и id/username.
  // eslint-disable-next-line no-console
  console.log(`Создан первый Director: id=${director.id} username=${director.username}`);
  // eslint-disable-next-line no-console
  console.log('Удалите SEED_DIRECTOR_PASSWORD из настроек сервера и смените пароль после первого входа.');
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
