import { Injectable, Logger } from '@nestjs/common';
import { AuditResult } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, redactMetadata } from './audit.types';

export interface RecordAuditEventInput {
  actorUserId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  result: AuditResult;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes security-relevant events. Never accepts/persists secrets - see
 * AuditEvent.metadata allowlist in audit.types.ts. This is a best-effort
 * side channel: a failure to write an audit row must never break the
 * primary request flow, but it is logged at warn level so gaps are visible.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          actorUserId: input.actorUserId ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          result: input.result,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: redactMetadata(input.metadata) as never,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist audit event ${input.action}: ${(err as Error).message}`);
    }
  }
}
