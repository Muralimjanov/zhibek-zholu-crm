/**
 * УДАЛЕНИЕ АККАУНТОВ И ИХ ДАННЫХ (необратимо).
 *
 * Показать, что будет удалено (ничего не меняет):
 *   DATABASE_URL='...' npm run ops:delete-users
 *
 * Удалить:
 *   DATABASE_URL='...' npm run ops:delete-users -- --apply
 *
 * Дополнительно:
 *   --roles head_of_sales,sales_manager   только эти роли (по умолчанию все, кроме директоров)
 *   --usernames ui_hos,ui_manager         только эти логины
 *
 * Защиты:
 * - директоров не удаляет никогда (иначе в системе не останется владельца);
 * - без --apply только печатает отчёт;
 * - всё удаление идёт одной транзакцией: либо целиком, либо ничего;
 * - журнал аудита сохраняется, у удалённых пользователей ссылка обнуляется.
 *
 * Вместе с аккаунтом удаляются созданные им записи: брони, договоры (и их
 * файлы), смены, выходные, начисления зарплаты, транзакции (и вложения),
 * согласия, сессии и запросы на подтверждение.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { resolve } from 'path';

export interface Options {
  apply: boolean;
  roles: UserRole[];
  usernames: string[];
}

const DELETABLE_ROLES: UserRole[] = [UserRole.head_of_sales, UserRole.sales_manager, UserRole.accountant, UserRole.investor];

export function parseArgs(argv: string[]): Options {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const rolesRaw = value('--roles');
  const roles = rolesRaw
    ? rolesRaw.split(',').map((r) => r.trim() as UserRole)
    : DELETABLE_ROLES;
  const unknown = roles.filter((r) => !DELETABLE_ROLES.includes(r));
  if (unknown.length > 0) {
    throw new Error(
      `Роли ${unknown.join(', ')} удалять нельзя. Допустимо: ${DELETABLE_ROLES.join(', ')} (директор не удаляется никогда).`,
    );
  }
  return {
    apply: argv.includes('--apply'),
    roles,
    usernames: (value('--usernames') ?? '').split(',').map((u) => u.trim()).filter(Boolean),
  };
}

interface Target {
  id: string;
  username: string;
  role: UserRole;
  counts: Record<string, number>;
}

export async function collectTargets(prisma: PrismaClient, opts: Options): Promise<Target[]> {
  const users = await prisma.user.findMany({
    where: {
      role: { in: opts.roles },
      ...(opts.usernames.length > 0 ? { username: { in: opts.usernames } } : {}),
    },
    orderBy: { username: 'asc' },
  });

  return Promise.all(
    users.map(async (u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      counts: {
        bookings: await prisma.booking.count({ where: { managerId: u.id } }),
        contracts: await prisma.contract.count({ where: { managerId: u.id } }),
        shifts: await prisma.shift.count({ where: { userId: u.id } }),
        dayOffs: await prisma.dayOff.count({ where: { OR: [{ userId: u.id }, { approvedById: u.id }] } }),
        payrollEntries: await prisma.payrollEntry.count({ where: { userId: u.id } }),
        transactions: await prisma.transaction.count({ where: { createdById: u.id } }),
        files: await prisma.storedFile.count({ where: { uploadedById: u.id } }),
      },
    })),
  );
}

/** Deletes the users and everything that points at them, in FK-safe order. */
export async function deleteUsers(prisma: PrismaClient, ids: string[], storageDir: string): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const removed: Record<string, number> = {};
  const count = (key: string, n: number) => (removed[key] = (removed[key] ?? 0) + n);

  const storageKeys = (
    await prisma.storedFile.findMany({ where: { uploadedById: { in: ids } }, select: { storageKey: true } })
  ).map((f) => f.storageKey);

  await prisma.$transaction(async (tx) => {
    const contracts = await tx.contract.findMany({ where: { managerId: { in: ids } }, select: { id: true } });
    const contractIds = contracts.map((c) => c.id);
    const fileIds = (await tx.storedFile.findMany({ where: { uploadedById: { in: ids } }, select: { id: true } })).map((f) => f.id);

    // Break references so the rows below can go.
    await tx.transaction.updateMany({ where: { relatedContractId: { in: contractIds } }, data: { relatedContractId: null } });
    await tx.transaction.updateMany({ where: { attachmentFileId: { in: fileIds } }, data: { attachmentFileId: null } });
    await tx.contract.updateMany({ where: { contractFileId: { in: fileIds } }, data: { contractFileId: null } });
    await tx.user.updateMany({ where: { avatarFileId: { in: fileIds } }, data: { avatarFileId: null } });
    // Employees created by (or led by) a deleted account stay, without the link.
    await tx.user.updateMany({ where: { createdById: { in: ids }, id: { notIn: ids } }, data: { createdById: null } });
    await tx.user.updateMany({ where: { teamLeadId: { in: ids }, id: { notIn: ids } }, data: { teamLeadId: null } });
    await tx.auditEvent.updateMany({ where: { actorUserId: { in: ids } }, data: { actorUserId: null } });

    count('transactions', (await tx.transaction.deleteMany({ where: { createdById: { in: ids } } })).count);
    count('payrollEntries', (await tx.payrollEntry.deleteMany({ where: { userId: { in: ids } } })).count);
    count('dayOffs', (await tx.dayOff.deleteMany({ where: { OR: [{ userId: { in: ids } }, { approvedById: { in: ids } }] } })).count);
    count('dailyReports', (await tx.dailyReport.updateMany({ where: { sourceShift: { userId: { in: ids } } }, data: { sourceShiftId: null } })).count);
    count('shifts', (await tx.shift.deleteMany({ where: { userId: { in: ids } } })).count);
    count('contracts', (await tx.contract.deleteMany({ where: { managerId: { in: ids } } })).count);
    count('bookings', (await tx.booking.deleteMany({ where: { managerId: { in: ids } } })).count);
    count('pendingActions', (await tx.pendingAction.deleteMany({ where: { initiatorUserId: { in: ids } } })).count);
    await tx.pendingAction.updateMany({ where: { confirmedByUserId: { in: ids } }, data: { confirmedByUserId: null } });
    await tx.pendingAction.updateMany({ where: { rejectedByUserId: { in: ids } }, data: { rejectedByUserId: null } });
    count('files', (await tx.storedFile.deleteMany({ where: { uploadedById: { in: ids } } })).count);
    count('users', (await tx.user.deleteMany({ where: { id: { in: ids } } })).count);
  });

  // Encrypted blobs on disk (consents, sessions and email codes go with the user row).
  const root = resolve(storageDir);
  for (const key of storageKeys) {
    if (/^[a-f0-9]{64}$/.test(key)) await fs.rm(resolve(root, key), { force: true }).catch(() => undefined);
  }
  return removed;
}

async function main() {
  dotenv.config();
  const opts = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const directors = await prisma.user.count({ where: { role: UserRole.director } });
    const targets = await collectTargets(prisma, opts);

    console.log(`База: ${new URL(process.env.DATABASE_URL ?? '').pathname.slice(1)}`);
    console.log(`Директоров в базе (не трогаем): ${directors}`);
    if (targets.length === 0) {
      console.log('Подходящих аккаунтов нет — удалять нечего.');
      return;
    }
    console.log(`\nБудет удалено аккаунтов: ${targets.length}`);
    for (const t of targets) {
      const data = Object.entries(t.counts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}: ${n}`)
        .join(', ');
      console.log(`  • ${t.username} (${t.role})${data ? ` — вместе с данными: ${data}` : ' — данных нет'}`);
    }

    if (!opts.apply) {
      console.log('\nЭто предварительный просмотр. Ничего не удалено.');
      console.log('Чтобы удалить, повторите команду с флагом --apply.');
      return;
    }

    const removed = await deleteUsers(prisma, targets.map((t) => t.id), process.env.FILE_STORAGE_DIR ?? './storage');
    console.log('\nУдалено:');
    for (const [k, n] of Object.entries(removed)) console.log(`  ${k}: ${n}`);
    console.log('Готово. Журнал аудита сохранён, ссылки на удалённых пользователей в нём обнулены.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('ops-delete-users:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
