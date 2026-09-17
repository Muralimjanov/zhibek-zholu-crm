import { ConfigService } from '@nestjs/config';
import { AppConfigService } from './app-config.service';

// Not `new ConfigService(env)`: ConfigService.get() consults process.env
// first, and Jest sets NODE_ENV=test there, which would silently override
// the NODE_ENV under test.
function configWith(env: Record<string, string | undefined>): AppConfigService {
  const isolated = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new AppConfigService(isolated);
}

describe('AppConfigService.isSmtpConfigured', () => {
  it('is false without SMTP_HOST in any environment', () => {
    expect(configWith({ NODE_ENV: 'development', SMTP_USER: 'u', SMTP_PASS: 'p' }).isSmtpConfigured).toBe(false);
    expect(configWith({ NODE_ENV: 'production', SMTP_USER: 'u', SMTP_PASS: 'p' }).isSmtpConfigured).toBe(false);
  });

  it('allows auth-less SMTP outside production (local Mailpit)', () => {
    const config = configWith({ NODE_ENV: 'development', SMTP_HOST: 'localhost', SMTP_USER: '', SMTP_PASS: '' });
    expect(config.isSmtpConfigured).toBe(true);
    expect(config.smtpHasCredentials).toBe(false);
  });

  it('still requires both credentials in production', () => {
    expect(configWith({ NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com' }).isSmtpConfigured).toBe(false);
    expect(
      configWith({ NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u', SMTP_PASS: 'p' })
        .isSmtpConfigured,
    ).toBe(true);
  });

  it('treats only one of SMTP_USER/SMTP_PASS as a misconfiguration everywhere', () => {
    for (const NODE_ENV of ['development', 'test', 'production']) {
      expect(configWith({ NODE_ENV, SMTP_HOST: 'h', SMTP_USER: 'u' }).isSmtpConfigured).toBe(false);
      expect(configWith({ NODE_ENV, SMTP_HOST: 'h', SMTP_PASS: 'p' }).isSmtpConfigured).toBe(false);
    }
  });
});

describe('AppConfigService.swaggerEnabled', () => {
  it('is always off in production, even if SWAGGER_ENABLED=true', () => {
    expect(configWith({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }).swaggerEnabled).toBe(false);
    expect(configWith({ NODE_ENV: 'development' }).swaggerEnabled).toBe(true);
    expect(configWith({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' }).swaggerEnabled).toBe(false);
  });

  it('trusts no proxy unless explicitly configured', () => {
    expect(configWith({}).trustProxy).toBe(false);
    expect(configWith({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
  });
});

describe('AppConfigService deployed-environment safety', () => {
  it('requires a strong JWT secret on staging and production, allows a fallback only locally', () => {
    expect(configWith({ NODE_ENV: 'development' }).jwtAccessSecret).toBe('dev-only-insecure-secret');
    for (const NODE_ENV of ['staging', 'production']) {
      expect(() => configWith({ NODE_ENV }).jwtAccessSecret).toThrow(/JWT_ACCESS_SECRET/);
      expect(() => configWith({ NODE_ENV, JWT_ACCESS_SECRET: 'short' }).jwtAccessSecret).toThrow();
      expect(configWith({ NODE_ENV, JWT_ACCESS_SECRET: 'x'.repeat(32) }).jwtAccessSecret).toBe('x'.repeat(32));
    }
  });

  it('secure cookies by default outside local dev; cannot be turned off in production', () => {
    expect(configWith({ NODE_ENV: 'development' }).cookieSecure).toBe(false);
    expect(configWith({ NODE_ENV: 'staging' }).cookieSecure).toBe(true);
    expect(configWith({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }).cookieSecure).toBe(true);
  });

  it('SameSite=None is only accepted together with Secure', () => {
    expect(() => configWith({ NODE_ENV: 'development', REFRESH_COOKIE_SAMESITE: 'none' }).refreshCookieSameSite).toThrow();
    expect(configWith({ NODE_ENV: 'staging', REFRESH_COOKIE_SAMESITE: 'none' }).refreshCookieSameSite).toBe('none');
    expect(() => configWith({ REFRESH_COOKIE_SAMESITE: 'anything' }).refreshCookieSameSite).toThrow();
  });

  it('Swagger stays available on staging, never in production', () => {
    expect(configWith({ NODE_ENV: 'staging' }).swaggerEnabled).toBe(true);
    expect(configWith({ NODE_ENV: 'production' }).swaggerEnabled).toBe(false);
  });
});

describe('AppConfigService.businessTimezone', () => {
  it('accepts Asia/Bishkek and rejects names that are not IANA zones (e.g. Asia/Osh)', () => {
    expect(configWith({}).businessTimezone).toBe('Asia/Bishkek');
    expect(() => configWith({ BUSINESS_TIMEZONE: 'Asia/Osh' }).businessTimezone).toThrow(/Asia\/Bishkek/);
  });
});
