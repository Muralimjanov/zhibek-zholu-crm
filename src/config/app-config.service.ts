import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Single point of access for runtime configuration. Fails fast on missing
 * required secrets rather than silently falling back to an insecure default
 * in production.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  private req(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  get isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  get port(): number {
    return Number(this.config.get<string>('PORT') ?? 3000);
  }

  get apiPrefix(): string {
    return this.config.get<string>('API_PREFIX') ?? 'api/v1';
  }

  get corsAllowedOrigins(): string[] {
    const raw = this.config.get<string>('CORS_ALLOWED_ORIGINS') ?? '';
    return raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  /** Swagger UI: off in production no matter what; on elsewhere unless SWAGGER_ENABLED=false. */
  get swaggerEnabled(): boolean {
    if (this.isProduction) return false;
    return this.config.get<string>('SWAGGER_ENABLED') !== 'false';
  }

  /**
   * Express `trust proxy` value. Default false (direct connections). Set to
   * the number of proxy hops (e.g. "1") or a subnet list only when the app
   * really sits behind that proxy.
   */
  get trustProxy(): false | number | string {
    const raw = this.config.get<string>('TRUST_PROXY');
    if (!raw || raw === 'false') return false;
    return /^\d+$/.test(raw) ? Number(raw) : raw;
  }

  get jsonBodyLimit(): string {
    return this.config.get<string>('JSON_BODY_LIMIT') ?? '100kb';
  }

  /** Local development or automated tests - the only places insecure fallbacks are allowed. */
  get isLocalEnvironment(): boolean {
    const env = this.config.get<string>('NODE_ENV') ?? 'development';
    return env === 'development' || env === 'test';
  }

  /**
   * Required (and at least 32 characters) on every deployed environment,
   * including staging - a guessable secret lets anyone mint access tokens.
   */
  get jwtAccessSecret(): string {
    const value = this.config.get<string>('JWT_ACCESS_SECRET');
    if (this.isLocalEnvironment) return value || 'dev-only-insecure-secret';
    if (!value || value.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be set to at least 32 characters outside development/test');
    }
    return value;
  }

  /** Secure cookie flag: COOKIE_SECURE overrides; defaults to true everywhere except local dev/test. */
  get cookieSecure(): boolean {
    const raw = this.config.get<string>('COOKIE_SECURE');
    if (raw === 'true') return true;
    if (raw === 'false') return this.isProduction ? true : false;
    return !this.isLocalEnvironment;
  }

  get jwtAccessTtlSeconds(): number {
    return Number(this.config.get<string>('JWT_ACCESS_TTL_SECONDS') ?? 900);
  }

  get refreshTokenTtlSeconds(): number {
    return Number(this.config.get<string>('REFRESH_TOKEN_TTL_SECONDS') ?? 2_592_000);
  }

  get refreshCookieName(): string {
    return this.config.get<string>('REFRESH_COOKIE_NAME') ?? 'uzz_refresh';
  }

  get refreshCookieDomain(): string | undefined {
    return this.config.get<string>('REFRESH_COOKIE_DOMAIN') || undefined;
  }

  /**
   * `none` is needed when the frontend runs on another site than the API
   * (e.g. localhost:5173 -> staging host); browsers accept it only with Secure.
   */
  get refreshCookieSameSite(): 'lax' | 'strict' | 'none' {
    const v = (this.config.get<string>('REFRESH_COOKIE_SAMESITE') ?? 'lax').toLowerCase();
    if (v !== 'lax' && v !== 'strict' && v !== 'none') {
      throw new Error('REFRESH_COOKIE_SAMESITE must be lax, strict or none');
    }
    if (v === 'none' && !this.cookieSecure) {
      throw new Error('REFRESH_COOKIE_SAMESITE=none requires secure cookies (COOKIE_SECURE=true)');
    }
    return v;
  }

  get csrfCookieName(): string {
    return this.config.get<string>('CSRF_COOKIE_NAME') ?? 'uzz_csrf';
  }

  get argon2Options() {
    return {
      memoryCost: Number(this.config.get<string>('ARGON2_MEMORY_COST') ?? 19456),
      timeCost: Number(this.config.get<string>('ARGON2_TIME_COST') ?? 2),
      parallelism: Number(this.config.get<string>('ARGON2_PARALLELISM') ?? 1),
    };
  }

  get encryptionCurrentVersion(): string {
    return this.config.get<string>('ENCRYPTION_KEY_CURRENT_VERSION') ?? 'v1';
  }

  encryptionKeyFor(version: string): string | undefined {
    return this.config.get<string>(`ENCRYPTION_KEY_${version.toUpperCase()}`);
  }

  /** HMAC key for blind indexes; must differ from the encryption keys. */
  get blindIndexKey(): string | undefined {
    return this.config.get<string>('BLIND_INDEX_KEY_V1') || undefined;
  }

  // --- Business calendar (OPEN QUESTION: working days / timezone) ----------
  /** IANA zone. Kyrgyzstan (Bishkek, Osh, ...) is `Asia/Bishkek`; an invalid name fails at boot. */
  get businessTimezone(): string {
    const tz = this.config.get<string>('BUSINESS_TIMEZONE') ?? 'Asia/Bishkek';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch {
      throw new Error(`BUSINESS_TIMEZONE "${tz}" is not a valid IANA time zone (Kyrgyzstan: Asia/Bishkek)`);
    }
    return tz;
  }

  /** ISO weekdays counted as working days (1=Mon ... 7=Sun). Default Mon-Fri. */
  get workingWeekdays(): number[] {
    const raw = this.config.get<string>('WORKING_WEEKDAYS') ?? '1,2,3,4,5';
    return raw
      .split(',')
      .map((d) => Number(d.trim()))
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  }

  get cronEnabled(): boolean {
    return this.config.get<string>('CRON_ENABLED') !== 'false';
  }

  /** How many past days the missed-shift job re-checks (catch-up after downtime). */
  get missedShiftLookbackDays(): number {
    return Number(this.config.get<string>('MISSED_SHIFT_LOOKBACK_DAYS') ?? 7);
  }

  // --- Private encrypted file storage ---------------------------------------
  get fileStorageDir(): string {
    return this.config.get<string>('FILE_STORAGE_DIR') ?? './storage';
  }

  get maxUploadBytes(): number {
    return Number(this.config.get<string>('MAX_UPLOAD_BYTES') ?? 10 * 1024 * 1024);
  }

  // --- Legal / consent -------------------------------------------------------
  /** Policy types every user must accept (current version) before using the API. */
  get requiredConsents(): string[] {
    const raw = this.config.get<string>('LEGAL_REQUIRED_CONSENTS') ?? 'privacy_policy,terms_of_use,personal_data_processing';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  get throttleTtlSeconds(): number {
    return Number(this.config.get<string>('THROTTLE_TTL_SECONDS') ?? 60);
  }

  get throttleLimit(): number {
    return Number(this.config.get<string>('THROTTLE_LIMIT') ?? 20);
  }

  get authThrottleTtlSeconds(): number {
    return Number(this.config.get<string>('AUTH_THROTTLE_TTL_SECONDS') ?? 60);
  }

  get authThrottleLimit(): number {
    return Number(this.config.get<string>('AUTH_THROTTLE_LIMIT') ?? 5);
  }

  // --- SMTP (generic, provider-agnostic email delivery) ---------------------
  get smtpHost(): string | undefined {
    return this.config.get<string>('SMTP_HOST') || undefined;
  }

  get smtpPort(): number {
    return Number(this.config.get<string>('SMTP_PORT') ?? 587);
  }

  get smtpSecure(): boolean {
    return this.config.get<string>('SMTP_SECURE') === 'true';
  }

  get smtpUser(): string | undefined {
    return this.config.get<string>('SMTP_USER') || undefined;
  }

  get smtpPass(): string | undefined {
    return this.config.get<string>('SMTP_PASS') || undefined;
  }

  get smtpFrom(): string {
    return this.config.get<string>('SMTP_FROM') ?? 'CRM Security <no-reply@localhost>';
  }

  get smtpHasCredentials(): boolean {
    return Boolean(this.smtpUser && this.smtpPass);
  }

  /**
   * Production: host + user + pass are all required (unchanged strictness).
   * Non-production: credentials are optional so a local auth-less SMTP
   * catcher (Mailpit, see docker-compose.dev.yml) works. In every
   * environment, setting only one of SMTP_USER/SMTP_PASS is treated as a
   * misconfiguration rather than silently sending unauthenticated.
   */
  get isSmtpConfigured(): boolean {
    if (!this.smtpHost) return false;
    const halfConfigured = Boolean(this.smtpUser) !== Boolean(this.smtpPass);
    if (halfConfigured) return false;
    if (this.isProduction) return this.smtpHasCredentials;
    return true;
  }

  // --- Confirmation codes (maker-checker step-up for sensitive actions) -----
  get confirmationCodeTtlSeconds(): number {
    return Number(this.config.get<string>('CONFIRMATION_CODE_TTL_SECONDS') ?? 600);
  }

  get confirmationCodeMaxAttempts(): number {
    return Number(this.config.get<string>('CONFIRMATION_CODE_MAX_ATTEMPTS') ?? 5);
  }
}
