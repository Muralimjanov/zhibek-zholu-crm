/**
 * ОДНОРАЗОВАЯ МИГРАЦИЯ ДАННЫХ: шифрование ПД, записанных до введения
 * шифрования на уровне приложения (User.fullName/phone/email и
 * PendingAction.payload с полями fullName/phone/email).
 *
 *   npx ts-node prisma/encrypt-existing-pii.ts            # dry-run: только показать, что будет изменено
 *   npx ts-node prisma/encrypt-existing-pii.ts --apply    # записать
 *
 * Безопасность:
 * - уже зашифрованные значения (enc:...) пропускаются - скрипт идемпотентен;
 * - все изменения в одной транзакции; перед коммитом каждое значение
 *   расшифровывается и сравнивается с исходным;
 * - сами ПД никогда не выводятся в консоль - только id и имена полей.
 * Сделайте резервную копию базы перед --apply.
 */
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { AppConfigService } from '../src/config/app-config.service';
import { EncryptionService } from '../src/crypto/encryption.service';
import { FieldCipher } from '../src/crypto/field-cipher.service';
import { USER_PII } from '../src/users/users.service';

dotenv.config();

const apply = process.argv.includes('--apply');

async function main() {
  const cipher = new FieldCipher(new EncryptionService(new AppConfigService(new ConfigService())));
  const prisma = new PrismaClient();
  const encryptVerified = (context: string, plain: string): string => {
    const enc = cipher.encrypt(context, plain);
    if (cipher.decrypt(context, enc) !== plain) throw new Error(`Round-trip check failed for ${context}`);
    return enc;
  };

  try {
    const users = await prisma.user.findMany();
    const userUpdates = users
      .map((u) => {
        const data: { fullName?: string; phone?: string; email?: string } = {};
        if (!FieldCipher.isEncrypted(u.fullName)) data.fullName = encryptVerified(USER_PII.fullName, u.fullName);
        if (u.phone && !FieldCipher.isEncrypted(u.phone)) data.phone = encryptVerified(USER_PII.phone, u.phone);
        if (u.email && !FieldCipher.isEncrypted(u.email)) data.email = encryptVerified(USER_PII.email, u.email);
        return { id: u.id, data };
      })
      .filter((x) => Object.keys(x.data).length > 0);

    const pending = await prisma.pendingAction.findMany({ where: { type: 'create_user' } });
    const pendingUpdates = pending
      .map((p) => {
        const payload = p.payload as Record<string, unknown>;
        if (typeof payload.fullName !== 'string') return null;
        const next: Record<string, unknown> = { ...payload };
        next.fullNameEnc = encryptVerified(USER_PII.fullName, payload.fullName);
        if (typeof payload.phone === 'string') next.phoneEnc = encryptVerified(USER_PII.phone, payload.phone);
        if (typeof payload.email === 'string') next.emailEnc = encryptVerified(USER_PII.email, payload.email);
        delete next.fullName;
        delete next.phone;
        delete next.email;
        return { id: p.id, payload: next };
      })
      .filter((x): x is { id: string; payload: Record<string, unknown> } => x !== null);

    for (const u of userUpdates) console.log(`User ${u.id}: зашифровать поля ${Object.keys(u.data).join(', ')}`);
    for (const p of pendingUpdates) console.log(`PendingAction ${p.id}: зашифровать ПД в payload`);
    if (userUpdates.length + pendingUpdates.length === 0) {
      console.log('Незашифрованных ПД не найдено - ничего делать не нужно.');
      return;
    }
    if (!apply) {
      console.log('Dry-run: изменения НЕ записаны. Запустите с --apply.');
      return;
    }

    await prisma.$transaction([
      ...userUpdates.map((u) => prisma.user.update({ where: { id: u.id }, data: u.data })),
      ...pendingUpdates.map((p) => prisma.pendingAction.update({ where: { id: p.id }, data: { payload: p.payload as never } })),
    ]);
    console.log(`Готово: пользователей ${userUpdates.length}, отложенных действий ${pendingUpdates.length}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Ошибка:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
