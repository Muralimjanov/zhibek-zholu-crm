/**
 * Проверяет резервную копию: открывается ли она ключом и что в ней.
 *
 *   BACKUP_KEY_PASSPHRASE='...' npm run backup:inspect -- <файл.uzzbak> <private.pem>
 *
 * Выводит дату, миграции и количество записей по таблицам. Данные не выводит.
 */
import { readFileSync } from 'fs';
import { decryptBackup } from '../src/backups/backup-crypto';
import { parseSnapshot } from '../src/backups/backup-snapshot';

function main() {
  const [file, keyPath] = process.argv.slice(2);
  if (!file || !keyPath) throw new Error('Использование: backup:inspect -- <файл.uzzbak> <private.pem>');
  const { header, plaintext } = decryptBackup(readFileSync(file), readFileSync(keyPath, 'utf8'), process.env.BACKUP_KEY_PASSPHRASE);
  const snapshot = parseSnapshot(plaintext);
  console.log(`Копия от: ${header.createdAt}`);
  console.log(`Миграций: ${snapshot.meta.migrations.length} (последняя: ${snapshot.meta.migrations.at(-1) ?? '-'})`);
  console.log('Записей по таблицам:');
  for (const [table, count] of Object.entries(snapshot.meta.counts)) console.log(`  ${table}: ${count}`);
  console.log(`Файлов: ${snapshot.files.length}, отсутствовали на диске при копировании: ${snapshot.meta.missingFiles.length}`);
  console.log('Копия цела и расшифровывается этим ключом.');
}

try {
  main();
} catch (err) {
  console.error('backup-inspect:', (err as Error).message);
  process.exitCode = 1;
}
