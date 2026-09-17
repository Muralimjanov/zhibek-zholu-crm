import { ConflictException } from '@nestjs/common';
import { ConsentPolicyType } from '@prisma/client';
import { ConsentService } from './consent.service';
import { AppConfigService } from '../config/app-config.service';
import { currentVersion } from '../legal/legal-documents';

const config = {
  requiredConsents: ['privacy_policy', 'terms_of_use', 'personal_data_processing'],
} as unknown as AppConfigService;

describe('ConsentService', () => {
  it('persists a consent for the CURRENT document version and writes an audit event', async () => {
    const prisma = {
      consentRecord: {
        create: jest.fn(async ({ data }: any) => ({ id: 'c-1', ...data })),
        findMany: jest.fn(),
      },
    } as any;
    const audit = { record: jest.fn(async () => undefined) } as any;
    const version = currentVersion('privacy_policy');

    const service = new ConsentService(prisma, audit, config);
    const result = await service.record({
      userId: 'u-1',
      policyType: ConsentPolicyType.privacy_policy,
      policyVersion: version,
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(result.policyType).toBe(ConsentPolicyType.privacy_policy);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CONSENT_RECORDED',
        metadata: { policyType: ConsentPolicyType.privacy_policy, policyVersion: version },
      }),
    );
  });

  it('rejects an outdated or made-up version, so a record always proves which text was accepted', async () => {
    const prisma = { consentRecord: { create: jest.fn() } } as any;
    const service = new ConsentService(prisma, { record: jest.fn() } as any, config);
    await expect(
      service.record({ userId: 'u-1', policyType: ConsentPolicyType.terms_of_use, policyVersion: '1.0' }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.consentRecord.create).not.toHaveBeenCalled();
  });

  it('reports which required consents are still missing', async () => {
    const prisma = {
      consentRecord: {
        findMany: jest.fn(async () => [
          { policyType: 'privacy_policy', policyVersion: currentVersion('privacy_policy'), acceptedAt: new Date() },
          { policyType: 'terms_of_use', policyVersion: 'old-version', acceptedAt: new Date() },
        ]),
      },
    } as any;
    const service = new ConsentService(prisma, { record: jest.fn() } as any, config);
    const status = await service.status('u-1');
    expect(status.allRequiredAccepted).toBe(false);
    expect(status.required.map((r) => [r.policyType, r.accepted])).toEqual([
      ['privacy_policy', true],
      ['terms_of_use', false],
      ['personal_data_processing', false],
    ]);
  });

  it('lists a user own consent history ordered by most recent', async () => {
    const prisma = {
      consentRecord: {
        create: jest.fn(),
        findMany: jest.fn(async () => [{ id: 'c-2' }, { id: 'c-1' }]),
      },
    } as any;
    const service = new ConsentService(prisma, { record: jest.fn() } as any, config);

    const result = await service.listForUser('u-1');
    expect(result).toEqual([{ id: 'c-2' }, { id: 'c-1' }]);
    expect(prisma.consentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u-1' } }),
    );
  });
});
