import { resolveSafeTestDatabaseUrl } from './guard';

// Runs in every test worker before any test module is imported, so that
// PrismaClient and ConfigService only ever see the test database. The
// original DATABASE_URL (if exported in the shell) is part of the guard.
const testUrl = resolveSafeTestDatabaseUrl([process.env.DATABASE_URL]);

// Load .env for keys/secrets (dotenv never overrides variables already set),
// then pin the database to the vetted test URL.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';

// Real SMTP delivery into the local Mailpit catcher (docker-compose.dev.yml).
process.env.SMTP_HOST = process.env.MAILPIT_SMTP_HOST ?? 'localhost';
process.env.SMTP_PORT = process.env.MAILPIT_SMTP_PORT ?? '1025';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';

// Deterministic values the assertions rely on.
process.env.CONFIRMATION_CODE_TTL_SECONDS = '600';
process.env.CONFIRMATION_CODE_MAX_ATTEMPTS = '5';
process.env.AUTH_THROTTLE_TTL_SECONDS = '60';
process.env.AUTH_THROTTLE_LIMIT = '5';

// No background job during tests (they call MissedShiftsService directly),
// and uploaded files go to a throw-away directory, never ./storage.
process.env.CRON_ENABLED = 'false';
process.env.BUSINESS_TIMEZONE = 'Asia/Bishkek';
process.env.WORKING_WEEKDAYS = '1,2,3,4,5';
process.env.FILE_STORAGE_DIR = require('path').join(require('os').tmpdir(), `uzz-crm-test-files-${process.pid}`);
process.env.SWAGGER_ENABLED = 'true';

// Emailed codes are ON by default. Suites that test other modules opt out of
// the step-up codes (never login) at the top of the file; reset here so the
// switch never leaks from one file into the next in the same process.
delete process.env.TEST_BYPASS_LOGIN_EMAIL_CODE;
delete process.env.TEST_BYPASS_ACTION_EMAIL_CODE;
process.env.EMAIL_TRANSPORT = 'smtp';
process.env.EMAIL_CODE_MAX_PER_15_MIN = '1000';
delete process.env.BACKUP_PUBLIC_KEY;
delete process.env.BACKUP_AGENT_TOKEN_SHA256;
