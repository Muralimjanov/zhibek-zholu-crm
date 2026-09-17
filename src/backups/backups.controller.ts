import { Controller, Get, NotFoundException, Req, Res, StreamableFile, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuditResult, UserRole } from '@prisma/client';
import { createHash, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipConsent } from '../common/decorators/skip-consent.decorator';
import { ctxOf } from '../common/request-context';
import { AppConfigService } from '../config/app-config.service';
import { RequireEmailCode } from '../email-codes/require-email-code.decorator';
import { BackupFile, BackupsService } from './backups.service';

@ApiTags('backups')
@Controller('backups')
export class BackupsController {
  constructor(
    private readonly backups: BackupsService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  @ApiBearerAuth()
  @Roles(UserRole.director)
  @Get('status')
  status() {
    return this.backups.status();
  }

  /** Manual download by a Director (needs a `backup.export` email code). */
  @ApiBearerAuth()
  @ApiProduces('application/octet-stream')
  @Roles(UserRole.director)
  @RequireEmailCode('backup.export')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Get('export')
  async export(@CurrentUser() actor: AuthenticatedUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.backups.export('director', actor.id, ctxOf(req)));
  }

  /**
   * Scheduled download by the backup agent on the Director's computer.
   * Authenticated by a long random token (header `Authorization: Bearer ...`)
   * whose SHA-256 is BACKUP_AGENT_TOKEN_SHA256. The file is encrypted to the
   * Director's key, so a leaked token exposes only unreadable ciphertext.
   */
  @Public()
  @SkipConsent()
  @SkipThrottle({ auth: true })
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiProduces('application/octet-stream')
  @Get('agent/export')
  async agentExport(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const expected = this.config.backupAgentTokenSha256;
    if (!expected) throw new NotFoundException('NOT_FOUND');
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const actual = createHash('sha256').update(token).digest();
    if (!token || !timingSafeEqual(actual, Buffer.from(expected, 'hex'))) {
      await this.audit.record({
        action: AuditAction.BACKUP_AGENT_AUTH_FAILED,
        entityType: 'Backup',
        result: AuditResult.failure,
        ...ctxOf(req),
      });
      throw new UnauthorizedException('BACKUP_AGENT_UNAUTHORIZED');
    }
    return this.send(res, await this.backups.export('agent', undefined, ctxOf(req)));
  }

  private send(res: Response, file: BackupFile): StreamableFile {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.content);
  }
}
