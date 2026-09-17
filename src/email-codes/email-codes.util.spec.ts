import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../config/app-config.service';
import { parseAddress } from '../notifications/email.service';
import { EMAIL_CODE_ACTIONS } from './email-code-actions';
import { isUuid, maskEmail } from './email-codes.service';

function config(env: Record<string, string>) {
  return new AppConfigService({ get: (k: string) => env[k] } as unknown as ConfigService);
}

describe('email code helpers', () => {
  it('masks the address the code was sent to', () => {
    expect(maskEmail('aibek@example.kg')).toBe('ai***@example.kg');
    expect(maskEmail('a@x.kg')).toBe('a***@x.kg');
    expect(maskEmail('broken')).toBe('***');
  });

  it('validates challenge ids', () => {
    expect(isUuid('3f1b2c4d-1111-4222-8333-444455556666')).toBe(true);
    expect(isUuid("1' OR 1=1")).toBe(false);
  });

  it('parses the sender address for the Brevo API', () => {
    expect(parseAddress('CRM Улуу Жибек Жолу <no-reply@uzz.kg>')).toEqual({ name: 'CRM Улуу Жибек Жолу', email: 'no-reply@uzz.kg' });
    expect(parseAddress('no-reply@uzz.kg')).toEqual({ email: 'no-reply@uzz.kg' });
  });

  it('binds record-level actions to a route parameter', () => {
    expect(EMAIL_CODE_ACTIONS['booking.delete'].resourceParam).toBe('id');
    expect(EMAIL_CODE_ACTIONS['accounting.period.close'].resourceParam).toBe('period');
    expect(EMAIL_CODE_ACTIONS['transaction.create'].resourceParam).toBeNull();
  });
});

describe('email code test bypass switches', () => {
  it.each(['development', 'staging', 'production'])('are ignored when NODE_ENV=%s', (env) => {
    const c = config({ NODE_ENV: env, TEST_BYPASS_LOGIN_EMAIL_CODE: 'true', TEST_BYPASS_ACTION_EMAIL_CODE: 'true' });
    expect(c.loginEmailCodeBypassedForTests).toBe(false);
    expect(c.actionEmailCodeBypassedForTests).toBe(false);
  });

  it('work only in NODE_ENV=test', () => {
    const c = config({ NODE_ENV: 'test', TEST_BYPASS_LOGIN_EMAIL_CODE: 'true' });
    expect(c.loginEmailCodeBypassedForTests).toBe(true);
    expect(c.actionEmailCodeBypassedForTests).toBe(false);
  });

  it('email is configured via Brevo only with an API key', () => {
    expect(config({ EMAIL_TRANSPORT: 'brevo' }).isEmailConfigured).toBe(false);
    expect(config({ EMAIL_TRANSPORT: 'brevo', BREVO_API_KEY: 'k' }).isEmailConfigured).toBe(true);
    expect(() => config({ EMAIL_TRANSPORT: 'pigeon' }).isEmailConfigured).toThrow();
  });
});

describe('BACKUP_PUBLIC_KEY parsing (values pasted into a hosting dashboard)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { generateKeyPairSync } = require('crypto');
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const b64 = Buffer.from(publicKey).toString('base64');
  const pem = (v: string) => config({ BACKUP_PUBLIC_KEY: v }).backupPublicKeyPem;

  it.each([
    ['plain base64', b64],
    ['with a label', `BACKUP_PUBLIC_KEY:\n${b64}`],
    ['with KEY= and quotes', `BACKUP_PUBLIC_KEY="${b64}"`],
    ['wrapped in lines and spaces', ` ${b64.slice(0, 300)}\n${b64.slice(300)} `],
    ['raw PEM', publicKey],
    ['one-line PEM with \\n', publicKey.replace(/\n/g, '\\n')],
  ])('accepts %s', (_name, value) => {
    expect(pem(value)?.trim()).toBe(publicKey.trim());
  });

  it('rejects a truncated key and garbage with a clear message', () => {
    expect(() => pem(b64.slice(0, 300))).toThrow('incomplete');
    expect(() => pem('not a key!')).toThrow('not valid');
    expect(pem('')).toBeUndefined();
  });
});
