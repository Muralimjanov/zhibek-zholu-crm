import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AuditResult } from '@prisma/client';
import { CronJob } from 'cron';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { AppConfigService } from '../config/app-config.service';
import { EmailService } from '../notifications/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { encryptBackup, publicKeyFingerprint } from './backup-crypto';
import { createSnapshot, serializeSnapshot } from './backup-snapshot';

export type BackupChannel = 'director' | 'agent';
const REMINDER_JOB = 'backup-reminder';

export interface BackupFile {
  fileName: string;
  content: Buffer;
}

@Injectable()
export class BackupsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly users: UsersService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const key = this.config.backupPublicKeyPem;
    if (key) {
      // Fail fast on a malformed key instead of at the first download.
      this.logger.log(`Backups enabled, public key sha256=${publicKeyFingerprint(key).slice(0, 16)}...`);
    } else {
      this.logger.warn('BACKUP_PUBLIC_KEY is not set - database backups cannot be downloaded');
    }
    if (!this.config.cronEnabled) return;
    const job = new CronJob('0 0 10 * * *', () => void this.remindIfStale(), null, false, this.config.businessTimezone);
    this.scheduler.addCronJob(REMINDER_JOB, job);
    job.start();
  }

  onModuleDestroy(): void {
    if (this.scheduler.doesExist('cron', REMINDER_JOB)) this.scheduler.deleteCronJob(REMINDER_JOB);
  }

  async export(channel: BackupChannel, actorUserId: string | undefined, ctx: { ip?: string; userAgent?: string }): Promise<BackupFile> {
    const publicKey = this.config.backupPublicKeyPem;
    if (!publicKey) throw new ServiceUnavailableException('BACKUP_NOT_CONFIGURED');
    const now = new Date();
    try {
      const snapshot = await createSnapshot(this.prisma, {
        storageDir: this.config.fileStorageDir,
        keys: this.applicationKeys(),
        now,
      });
      const content = encryptBackup(serializeSnapshot(snapshot), publicKey, now);
      await this.audit.record({
        actorUserId,
        action: AuditAction.BACKUP_EXPORTED,
        entityType: 'Backup',
        result: AuditResult.success,
        ...ctx,
        metadata: { channel, sizeBytes: content.length, count: snapshot.meta.missingFiles.length },
      });
      const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
      return { fileName: `uzz-crm-backup-${stamp}.uzzbak`, content };
    } catch (err) {
      this.logger.error(`Backup export failed: ${(err as Error).message}`);
      await this.audit.record({
        actorUserId,
        action: AuditAction.BACKUP_EXPORT_FAILED,
        entityType: 'Backup',
        result: AuditResult.failure,
        ...ctx,
        metadata: { channel },
      });
      throw new ServiceUnavailableException('BACKUP_EXPORT_FAILED');
    }
  }

  async status() {
    const last = await this.prisma.auditEvent.findFirst({
      where: { action: AuditAction.BACKUP_EXPORTED, result: AuditResult.success },
      orderBy: { createdAt: 'desc' },
    });
    const publicKey = this.config.backupPublicKeyPem;
    return {
      configured: Boolean(publicKey),
      agentConfigured: Boolean(this.config.backupAgentTokenSha256),
      publicKeySha256: publicKey ? publicKeyFingerprint(publicKey) : null,
      lastExportAt: last?.createdAt ?? null,
      lastExportChannel: (last?.metadata as { channel?: string } | null)?.channel ?? null,
      reminderAfterHours: this.config.backupReminderHours,
    };
  }

  /** Emails Directors when no backup was downloaded for BACKUP_REMINDER_HOURS. */
  async remindIfStale(now: Date = new Date()): Promise<boolean> {
    try {
      const { lastExportAt } = await this.status();
      const hours = this.config.backupReminderHours;
      if (lastExportAt && now.getTime() - lastExportAt.getTime() < hours * 3_600_000) return false;
      const recipients = await this.users.listDirectorEmails();
      if (recipients.length === 0) return false;
      await this.email.send({
        to: recipients,
        subject: 'CRM: резервная копия базы давно не сохранялась',
        text:
          (lastExportAt
            ? `Последняя резервная копия базы скачана ${lastExportAt.toISOString()} (более ${hours} ч. назад).\n\n`
            : 'Резервная копия базы ещё ни разу не скачивалась.\n\n') +
          'Проверьте, что программа резервного копирования на компьютере Директора включена и компьютер подключён к интернету, ' +
          'или скачайте копию вручную в CRM (раздел «Резервные копии»).\n' +
          'Без свежей копии при удалении или сбое базы данные за этот период будут потеряны.',
      });
      await this.audit.record({
        action: AuditAction.BACKUP_REMINDER_SENT,
        entityType: 'Backup',
        result: AuditResult.success,
        metadata: { recipientCount: recipients.length },
      });
      return true;
    } catch (err) {
      this.logger.warn(`Backup reminder failed: ${(err as Error).message}`);
      return false;
    }
  }

  private applicationKeys(): Record<string, string> {
    const keys: Record<string, string> = {
      ENCRYPTION_KEY_CURRENT_VERSION: this.config.encryptionCurrentVersion,
      ...this.config.allEncryptionKeys,
    };
    const blind = this.config.blindIndexKey;
    if (blind) keys.BLIND_INDEX_KEY_V1 = blind;
    return keys;
  }
}
