import { randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';
import { AppConfigService } from '../config/app-config.service';

function fakeConfig(keys: Record<string, string>, currentVersion = 'v1'): AppConfigService {
  return {
    encryptionCurrentVersion: currentVersion,
    encryptionKeyFor: (version: string) => keys[version],
  } as unknown as AppConfigService;
}

describe('EncryptionService', () => {
  const keyV1 = randomBytes(32).toString('base64');
  const keyV2 = randomBytes(32).toString('base64');

  it('encrypts and decrypts round-trip correctly', () => {
    const service = new EncryptionService(fakeConfig({ v1: keyV1 }));
    const plaintext = 'AB1234567 passport-like value';
    const payload = service.encrypt(plaintext);

    expect(payload.keyVersion).toBe('v1');
    expect(payload.ciphertext).not.toContain(plaintext);
    expect(service.decrypt(payload)).toBe(plaintext);
  });

  it('uses a unique IV for every encryption operation', () => {
    const service = new EncryptionService(fakeConfig({ v1: keyV1 }));
    const a = service.encrypt('same plaintext');
    const b = service.encrypt('same plaintext');
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it('fails to decrypt if the auth tag / ciphertext has been tampered with', () => {
    const service = new EncryptionService(fakeConfig({ v1: keyV1 }));
    const payload = service.encrypt('sensitive value');
    const tampered = { ...payload, ciphertext: Buffer.from('tampered').toString('base64') };
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('supports decrypting an old key version after rotation (key versioning)', () => {
    const encryptedWithV1 = new EncryptionService(fakeConfig({ v1: keyV1 }, 'v1')).encrypt(
      'old value',
    );
    const serviceAfterRotation = new EncryptionService(fakeConfig({ v1: keyV1, v2: keyV2 }, 'v2'));
    expect(serviceAfterRotation.decrypt(encryptedWithV1)).toBe('old value');

    const encryptedWithV2 = serviceAfterRotation.encrypt('new value');
    expect(encryptedWithV2.keyVersion).toBe('v2');
  });

  it('throws a clear error if the configured key is not 32 bytes', () => {
    const shortKey = Buffer.from('too-short').toString('base64');
    const service = new EncryptionService(fakeConfig({ v1: shortKey }));
    expect(() => service.encrypt('x')).toThrow(/32 bytes/);
  });
});
