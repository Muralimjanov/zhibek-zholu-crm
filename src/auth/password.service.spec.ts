import { PasswordService } from './password.service';
import { AppConfigService } from '../config/app-config.service';

function fakeConfig(): AppConfigService {
  return {
    argon2Options: { memoryCost: 8192, timeCost: 2, parallelism: 1 },
  } as unknown as AppConfigService;
}

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService(fakeConfig());
  });

  it('hashes a password using Argon2id and never returns the plaintext', async () => {
    const hash = await service.hash('CorrectHorseBatteryStaple123');
    expect(hash).toContain('$argon2id$');
    expect(hash).not.toContain('CorrectHorseBatteryStaple123');
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await service.hash('CorrectHorseBatteryStaple123');
    await expect(service.verify(hash, 'CorrectHorseBatteryStaple123')).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('CorrectHorseBatteryStaple123');
    await expect(service.verify(hash, 'WrongPassword')).resolves.toBe(false);
  });

  it('produces a different hash for the same password on each call (unique salt)', async () => {
    const a = await service.hash('SamePassword12345');
    const b = await service.hash('SamePassword12345');
    expect(a).not.toEqual(b);
  });

  it('never throws on a malformed hash - treats it as verification failure', async () => {
    await expect(service.verify('not-a-real-hash', 'anything')).resolves.toBe(false);
  });
});
