/**
 * ПОЛНАЯ ОЧИСТКА РАБОЧИХ ДАННЫХ (необратимо).
 *
 * Оставляет в базе только директоров: их аккаунты, согласия и аватары.
 * Удаляет всё остальное — сотрудников, лиды, брони, договоры, смены,
 * выходные, зарплату, бухгалтерию, отчёты и файлы. Журнал аудита остаётся:
 * у удалённых пользователей ссылка в нём обнуляется.
 *
 * Показать, что будет удалено (ничего не меняет):
 *   npm run ops:reset-data -- --env-file .env.render
 *
 * Удалить (нужно подтвердить имя базы из отчёта):
 *   npm run ops:reset-data -- --env-file .env.render --db uzz_crm_u7hn --apply
 *
 * Защиты:
 * - директоров не удаляет никогда (иначе в системе не останется владельца);
 * - без --apply только печатает отчёт;
 * - при --apply требуется --db с именем базы: очистить не ту базу нельзя;
 * - всё удаление идёт одной транзакцией: либо целиком, либо ничего.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { databaseName } from './ops-delete-users';

export interface ResetOptions {
  apply: boolean;
  db?: string;
  envFile?: string;
}

export function parseResetArgs(argv: string[]): ResetOptions {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const apply = argv.includes('--apply');
  const db = value('--db');
  if (apply && !db) {
    throw new Error('Для очистки добавьте --db <имя базы из отчёта>: это подтверждение, что чистим именно её.');
  }
  return { apply, db, envFile: value('--env-file') };
}

/** Что сейчас лежит в базе — печатается до удаления и после. */
export async function countEverything(prisma: PrismaClient): Promise<Record<string, number>> {
  const [
    directors, otherUsers, leads, bookings, contracts, shifts, dayOffs,
    payrollEntries, payrollSettings, transactions, accountingPeriods,
    dailyReports, files, pendingActions, consents, audit,
  ] = await Promise.all([
    prisma.user.count({ where: { role: UserRole.director } }),
    prisma.user.count({ where: { role: { not: UserRole.director } } }),
    prisma.lead.count(),
    prisma.booking.count(),
    prisma.contract.count(),
    prisma.shift.count(),
    prisma.dayOff.count(),
    prisma.payrollEntry.count(),
    prisma.payrollSettings.count(),
    prisma.transaction.count(),
    prisma.accountingPeriod.count(),
    prisma.dailyReport.count(),
    prisma.storedFile.count(),
    prisma.pendingAction.count(),
    prisma.consentRecord.count(),
    prisma.auditEvent.count(),
  ]);
  return {
    'директоров (остаются)': directors,
    'остальных сотрудников': otherUsers,
    лидов: leads,
    броней: bookings,
    договоров: contracts,
    смен: shifts,
    выходных: dayOffs,
    'начислений зарплаты': payrollEntries,
    'настроек зарплаты': payrollSettings,
    'операций бухгалтерии': transactions,
    'закрытых месяцев': accountingPeriods,
    'ежедневных отчётов': dailyReports,
    файлов: files,
    'запросов на подтверждение': pendingActions,
    согласий: consents,
    'событий аудита (остаются)': audit,
  };
}

/**
 * Удаляет всё, кроме директоров. Порядок важен: сначала снимаются ссылки,
 * потом идут сами записи — от зависимых к тем, на кого они ссылаются.
 */
export async function resetData(prisma: PrismaClient, storageDir: string): Promise<Record<string, number>> {
  const directors = await prisma.user.findMany({ where: { role: UserRole.director }, select: { id: true, avatarFileId: true } });
  const directorIds = directors.map((d) => d.id);
  const keepFileIds = directors.map((d) => d.avatarFileId).filter((id): id is string => id !== null);

  // Ключи файлов на диске: удалять их можно только после того, как строки ушли.
  const storageKeys = (
    await prisma.storedFile.findMany({ where: { id: { notIn: keepFileIds } }, select: { storageKey: true } })
  ).map((f) => f.storageKey);

  const removed: Record<string, number> = {};
  const count = (key: string, n: number) => {
    if (n > 0) removed[key] = (removed[key] ?? 0) + n;
  };

  await prisma.$transaction(
    async (tx) => {
      // Порядок строго от зависимых записей к тем, на кого они ссылаются.
      // Обнулять ссылки заранее нельзя: у подписанного договора проверка в
      // базе требует и взнос, и файл, поэтому снятый файл её нарушает.
      count('лидов', (await tx.lead.deleteMany({})).count);
      count('операций бухгалтерии', (await tx.transaction.deleteMany({})).count);
      count('закрытых месяцев', (await tx.accountingPeriod.deleteMany({})).count);
      count('начислений зарплаты', (await tx.payrollEntry.deleteMany({})).count);
      count('настроек зарплаты', (await tx.payrollSettings.deleteMany({})).count);
      count('ежедневных отчётов', (await tx.dailyReport.deleteMany({})).count);
      count('выходных', (await tx.dayOff.deleteMany({})).count);
      count('смен', (await tx.shift.deleteMany({})).count);
      count('договоров', (await tx.contract.deleteMany({})).count);
      count('броней', (await tx.booking.deleteMany({})).count);
      count('запросов на подтверждение', (await tx.pendingAction.deleteMany({})).count);

      // Аватары директоров остаются, остальные файлы уже никто не держит.
      await tx.user.updateMany({ where: { avatarFileId: { notIn: keepFileIds } }, data: { avatarFileId: null } });
      count('файлов', (await tx.storedFile.deleteMany({ where: { id: { notIn: keepFileIds } } })).count);

      // Сотрудники. Согласия и сессии директоров не трогаем.
      // Ссылки «кто создал» и «чья команда» ведут на тех, кого не станет.
      await tx.user.updateMany({ data: { createdById: null, teamLeadId: null } });
      await tx.auditEvent.updateMany({ where: { actorUserId: { notIn: directorIds } }, data: { actorUserId: null } });
      count('согласий сотрудников', (await tx.consentRecord.deleteMany({ where: { userId: { notIn: directorIds } } })).count);
      count('сессий сотрудников', (await tx.refreshToken.deleteMany({ where: { userId: { notIn: directorIds } } })).count);
      count('кодов из писем', (await tx.emailCode.deleteMany({})).count);
      count('сотрудников', (await tx.user.deleteMany({ where: { id: { notIn: directorIds } } })).count);
      // Удалённая база далеко (Render во Франкфурте) — стандартных 5 секунд мало.
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  // Зашифрованные файлы на диске — после того, как строки удалены.
  const root = resolve(storageDir);
  for (const key of storageKeys) {
    if (/^[a-f0-9]{64}$/.test(key)) await fs.rm(resolve(root, key), { force: true }).catch(() => undefined);
  }
  return removed;
}

async function main() {
  const opts = parseResetArgs(process.argv.slice(2));
  // --env-file важнее переменных оболочки, .env — только на крайний случай.
  if (opts.envFile) dotenv.config({ path: opts.envFile, override: true });
  dotenv.config();
  const actualDb = databaseName(process.env.DATABASE_URL);
  if (opts.apply && opts.db !== actualDb) {
    throw new Error(`Подключение к базе "${actualDb}", а в --db указано "${opts.db}". Очистка отменена.`);
  }

  const prisma = new PrismaClient();
  try {
    const before = await countEverything(prisma);
    console.log(`База: ${actualDb}\n`);
    console.log('Сейчас в базе:');
    for (const [key, n] of Object.entries(before)) console.log(`  ${key}: ${n}`);

    if (before['директоров (остаются)'] === 0) {
      throw new Error('В базе нет ни одного директора — очистка оставила бы систему без владельца. Отменено.');
    }

    if (!opts.apply) {
      console.log('\nЭто предварительный просмотр. Ничего не удалено.');
      console.log(`Чтобы очистить, повторите команду с флагами: --db ${actualDb} --apply`);
      return;
    }

    const removed = await resetData(prisma, process.env.FILE_STORAGE_DIR ?? './storage');
    console.log('\nУдалено:');
    for (const [key, n] of Object.entries(removed)) console.log(`  ${key}: ${n}`);

    console.log('\nОсталось:');
    for (const [key, n] of Object.entries(await countEverything(prisma))) console.log(`  ${key}: ${n}`);
    console.log('\nГотово. Журнал аудита сохранён, ссылки на удалённых сотрудников в нём обнулены.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('ops-reset-data:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
