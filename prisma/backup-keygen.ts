/**
 * Генерирует пару ключей для резервных копий (один раз).
 *
 *   BACKUP_KEY_PASSPHRASE='длинная фраза' npm run backup:keygen -- ./backup-keys
 *
 * - private.pem  — ЗАКРЫТЫЙ ключ, зашифрован паролем BACKUP_KEY_PASSPHRASE.
 *   Хранить у Директора (флешка/сейф + копия), НИКОГДА не класть на сервер,
 *   в git или в мессенджер. Без него и без пароля копии не открыть.
 * - public.pem   — открытый ключ; его значение (base64) ставится на сервер
 *   в переменную BACKUP_PUBLIC_KEY.
 */
import { generateKeyPairSync } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { publicKeyFingerprint } from '../src/backups/backup-crypto';

function main() {
  const passphrase = process.env.BACKUP_KEY_PASSPHRASE ?? '';
  if (passphrase.length < 16) {
    throw new Error('Задайте BACKUP_KEY_PASSPHRASE не короче 16 символов (запишите её отдельно от ключа).');
  }
  const dir = resolve(process.argv[2] ?? './backup-keys');
  const privatePath = join(dir, 'private.pem');
  const publicPath = join(dir, 'public.pem');
  if (existsSync(privatePath) || existsSync(publicPath)) {
    throw new Error(`В ${dir} уже есть ключи — перезапись запрещена (старые копии открываются только старым ключом).`);
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase },
  });
  writeFileSync(privatePath, privateKey, { mode: 0o600, flag: 'wx' });
  writeFileSync(publicPath, publicKey, { mode: 0o644, flag: 'wx' });

  console.log(`Закрытый ключ: ${privatePath}  (хранить у Директора, не на сервере)`);
  console.log(`Открытый ключ: ${publicPath}`);
  console.log(`Отпечаток: ${publicKeyFingerprint(publicKey)}`);
  console.log('\nЗначение для переменной сервера BACKUP_PUBLIC_KEY:\n');
  console.log(Buffer.from(publicKey, 'utf8').toString('base64'));
}

try {
  main();
} catch (err) {
  console.error('backup-keygen:', (err as Error).message);
  process.exitCode = 1;
}
