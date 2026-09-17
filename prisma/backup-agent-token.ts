/**
 * Генерирует токен для программы резервного копирования на компьютере Директора.
 *
 *   npm run backup:agent-token
 *
 * - TOKEN            — вписывается в программу-агент на компьютере Директора;
 * - TOKEN SHA-256    — ставится на сервер в BACKUP_AGENT_TOKEN_SHA256.
 * Сам токен на сервере не хранится. Утечка токена даёт только зашифрованный
 * файл, который без закрытого ключа Директора не прочитать; при утечке
 * сгенерируйте новый и замените оба значения.
 */
import { createHash, randomBytes } from 'crypto';

const token = randomBytes(32).toString('base64url');
console.log(`TOKEN (для агента на компьютере Директора): ${token}`);
console.log(`BACKUP_AGENT_TOKEN_SHA256 (для сервера):    ${createHash('sha256').update(token).digest('hex')}`);
