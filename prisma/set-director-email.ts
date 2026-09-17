/**
 * ОДНОРАЗОВЫЙ OPS-СКРИПТ: задать email существующему Director-аккаунту.
 *
 * Нужен, потому что без email у Director-а коды подтверждения
 * (ConfirmationsService) никому не доставляются. Это НЕ HTTP endpoint;
 * запускается вручную человеком с доступом к базе:
 *
 *   npx ts-node prisma/set-director-email.ts --username director1 --email you@example.com
 *   # заменить уже заданный email:
 *   npx ts-node prisma/set-director-email.ts --username director1 --email new@example.com --overwrite
 *
 * Безопасность по умолчанию:
 * - меняет только пользователя с role=director и status=active;
 * - не перезаписывает уже заданный email без явного --overwrite;
 * - меняет только поле email и пишет AuditEvent USER_PROFILE_UPDATED
 *   (сам адрес в аудит не пишется - metadata allowlist).
 */
import { AuditResult, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import * as dotenv from 'dotenv';
import { AuditAction } from '../src/audit/audit.types';
import { AppConfigService } from '../src/config/app-config.service';
import { EncryptionService } from '../src/crypto/encryption.service';
import { FieldCipher } from '../src/crypto/field-cipher.service';
import { USER_PII } from '../src/users/users.service';

interface Args {
  username: string;
  email: string;
  overwrite: boolean;
}

export function parseArgs(argv: string[]): Args {
  const valueOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const username = valueOf('--username');
  const email = valueOf('--email');
  if (!username || !email) {
    throw new Error('Использование: --username <username> --email <email> [--overwrite]');
  }
  if (!isEmail(email) || email.length > 254) {
    throw new Error('Некорректный email.');
  }
  return { username, email, overwrite: argv.includes('--overwrite') };
}

async function main() {
  dotenv.config();
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  // Email is PII: stored encrypted exactly like UsersService does.
  const cipher = new FieldCipher(new EncryptionService(new AppConfigService(new ConfigService())));
  try {
    const user = await prisma.user.findUnique({ where: { username: args.username } });
    if (!user || user.role !== UserRole.director || user.status !== UserStatus.active) {
      throw new Error(`Активный Director с username "${args.username}" не найден.`);
    }
    if (user.email && !args.overwrite) {
      throw new Error('У этого Director-а email уже задан. Для замены добавьте --overwrite.');
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { email: cipher.encrypt(USER_PII.email, args.email) } }),
      prisma.auditEvent.create({
        data: {
          actorUserId: null,
          action: AuditAction.USER_PROFILE_UPDATED,
          entityType: 'User',
          entityId: user.id,
          result: AuditResult.success,
          metadata: { targetUserId: user.id, reason: 'ops_script_set_director_email' },
        },
      }),
    ]);

    // eslint-disable-next-line no-console
    console.log(`Email обновлён для Director id=${user.id} username=${user.username}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Ошибка:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
