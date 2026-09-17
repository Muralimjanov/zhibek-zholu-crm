/**
 * ВОССТАНОВЛЕНИЕ базы из резервной копии в НОВУЮ ПУСТУЮ базу.
 *
 *   1) создать пустую базу и применить миграции:
 *        DATABASE_URL=... npx prisma migrate deploy
 *   2) восстановить:
 *        DATABASE_URL=... FILE_STORAGE_DIR=./storage BACKUP_KEY_PASSPHRASE='...' \
 *          npm run backup:restore -- <файл.uzzbak> <private.pem> <куда-записать-ключи.env>
 *   3) перенести значения из файла ключей в переменные окружения сервера
 *      (ENCRYPTION_KEY_*, BLIND_INDEX_KEY_V1) — без них данные не расшифровать;
 *      затем удалить этот файл.
 *
 * Защиты: в непустую базу восстановление не выполняется; файл ключей не
 * перезаписывается и создаётся с правами 0600.
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';
import { decryptBackup } from '../src/backups/backup-crypto';
import { parseSnapshot, restoreSnapshot } from '../src/backups/backup-snapshot';

async function main() {
  dotenv.config();
  const [file, keyPath, keysOut] = process.argv.slice(2);
  if (!file || !keyPath || !keysOut) {
    throw new Error('Использование: backup:restore -- <файл.uzzbak> <private.pem> <restored-keys.env>');
  }
  const storageDir = process.env.FILE_STORAGE_DIR ?? './storage';
  const { header, plaintext } = decryptBackup(readFileSync(file), readFileSync(keyPath, 'utf8'), process.env.BACKUP_KEY_PASSPHRASE);
  const snapshot = parseSnapshot(plaintext);
  console.log(`Копия от ${header.createdAt}. Восстановление в пустую базу...`);

  // Keys first: if the restore then fails half-way nothing is lost, and if it
  // succeeds the data is readable.
  const lines = Object.entries(snapshot.keys).map(([k, v]) => `${k}=${v}`);
  writeFileSync(keysOut, `# Ключи из резервной копии ${header.createdAt}. Перенесите в окружение сервера и удалите файл.\n${lines.join('\n')}\n`, {
    mode: 0o600,
    flag: 'wx',
  });

  const prisma = new PrismaClient();
  try {
    const restored = await restoreSnapshot(prisma, snapshot, { storageDir });
    for (const [table, count] of Object.entries(restored)) console.log(`  ${table}: ${count}`);
    console.log(`Готово. Ключи записаны в ${keysOut} — перенесите их на сервер (ENCRYPTION_KEY_*, BLIND_INDEX_KEY_V1).`);
    console.log('Все пользователи должны войти заново (сессии в копию не входят).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('backup-restore:', (err as Error).message);
  process.exitCode = 1;
});
