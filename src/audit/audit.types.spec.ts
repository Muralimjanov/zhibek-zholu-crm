import { redactMetadata } from './audit.types';

describe('redactMetadata', () => {
  it('returns undefined for undefined input', () => {
    expect(redactMetadata(undefined)).toBeUndefined();
  });

  it('keeps allowlisted keys', () => {
    const result = redactMetadata({ targetUserId: 'u1', targetRole: 'accountant' });
    expect(result).toEqual({ targetUserId: 'u1', targetRole: 'accountant' });
  });

  it('strips forbidden sensitive keys even if present', () => {
    const result = redactMetadata({
      targetUserId: 'u1',
      password: 'hunter2',
      passwordHash: '$argon2id$...',
      refreshToken: 'raw-secret-token',
      accessToken: 'jwt.token.here',
      encryptionKey: 'base64key',
      passportNumber: 'AN1234567',
      documentContent: 'binary blob',
    });
    expect(result).toEqual({ targetUserId: 'u1' });
  });

  it('strips keys not on the allowlist even if not explicitly forbidden', () => {
    const result = redactMetadata({ someRandomInternalField: 'value' });
    expect(result).toBeUndefined();
  });

  it('returns undefined instead of an empty object when nothing survives redaction', () => {
    const result = redactMetadata({ password: 'secret' });
    expect(result).toBeUndefined();
  });
});
