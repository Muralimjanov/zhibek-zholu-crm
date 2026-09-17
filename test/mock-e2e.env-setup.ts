// The Prisma-mocked e2e suite logs in many times from 127.0.0.1 within one
// minute. It does not test rate limiting (test/real-db.e2e-spec.ts does, with
// the real throttler), so the auth throttler must not interfere with it.
// ConfigService reads process.env before .env, so this only affects this run.
process.env.AUTH_THROTTLE_LIMIT = '1000';
process.env.BUSINESS_TIMEZONE = 'Asia/Bishkek';
// This suite predates emailed login/step-up codes and runs without an SMTP
// server; the code flows are covered by test/real-db/email-codes.e2e-spec.ts.
// Both switches are honoured only when NODE_ENV=test.
process.env.TEST_BYPASS_LOGIN_EMAIL_CODE = 'true';
process.env.TEST_BYPASS_ACTION_EMAIL_CODE = 'true';
