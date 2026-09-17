import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuditResult, ConsentPolicyType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { AppConfigService } from '../config/app-config.service';
import { LEGAL_DOCUMENTS, LegalDocumentType, currentVersion } from '../legal/legal-documents';

export interface RecordConsentInput {
  userId: string;
  policyType: ConsentPolicyType;
  policyVersion: string;
  ip?: string;
  userAgent?: string;
}

export interface ConsentStatusItem {
  policyType: ConsentPolicyType;
  currentVersion: string;
  accepted: boolean;
  acceptedAt: Date | null;
}

/**
 * Versioned consent (AUTH_SPEC.md §13). A consent is only accepted for the
 * CURRENT published version of a document - accepting an arbitrary or
 * outdated version string is rejected, so the record always proves which
 * text the user saw. Which consents are legally required is an open question
 * (#26); the set is configurable via LEGAL_REQUIRED_CONSENTS.
 */
@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  async record(input: RecordConsentInput) {
    const doc = LEGAL_DOCUMENTS[input.policyType as LegalDocumentType];
    if (!doc || doc.audience === 'buyer') {
      throw new BadRequestException('CONSENT_POLICY_UNKNOWN');
    }
    if (input.policyVersion !== doc.version) {
      throw new ConflictException('CONSENT_VERSION_NOT_CURRENT');
    }

    const record = await this.prisma.consentRecord.create({
      data: {
        userId: input.userId,
        policyType: input.policyType,
        policyVersion: input.policyVersion,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });

    await this.audit.record({
      actorUserId: input.userId,
      action: AuditAction.CONSENT_RECORDED,
      entityType: 'ConsentRecord',
      entityId: record.id,
      result: AuditResult.success,
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: { policyType: input.policyType, policyVersion: input.policyVersion },
    });

    return record;
  }

  async listForUser(userId: string) {
    return this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { acceptedAt: 'desc' },
    });
  }

  requiredPolicyTypes(): ConsentPolicyType[] {
    const valid = Object.values(ConsentPolicyType) as string[];
    return this.config.requiredConsents.filter((t) => valid.includes(t)) as ConsentPolicyType[];
  }

  async status(userId: string): Promise<{ allRequiredAccepted: boolean; required: ConsentStatusItem[] }> {
    const required = this.requiredPolicyTypes();
    const records = await this.prisma.consentRecord.findMany({
      where: { userId, policyType: { in: required } },
      orderBy: { acceptedAt: 'desc' },
    });
    const items = required.map((policyType) => {
      const version = currentVersion(policyType as LegalDocumentType);
      const match = records.find((r) => r.policyType === policyType && r.policyVersion === version);
      return { policyType, currentVersion: version, accepted: Boolean(match), acceptedAt: match?.acceptedAt ?? null };
    });
    return { allRequiredAccepted: items.every((i) => i.accepted), required: items };
  }

  async hasAllRequired(userId: string): Promise<boolean> {
    const required = this.requiredPolicyTypes();
    if (required.length === 0) return true;
    const count = await this.prisma.consentRecord.findMany({
      where: {
        userId,
        OR: required.map((policyType) => ({ policyType, policyVersion: currentVersion(policyType as LegalDocumentType) })),
      },
      distinct: ['policyType'],
      select: { policyType: true },
    });
    return count.length === required.length;
  }
}
