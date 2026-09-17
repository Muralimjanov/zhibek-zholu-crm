// The Prisma-mocked e2e suite logs in many times from 127.0.0.1 within one
// minute. It does not test rate limiting (test/real-db.e2e-spec.ts does, with
// the real throttler), so the auth throttler must not interfere with it.
// ConfigService reads process.env before .env, so this only affects this run.
process.env.AUTH_THROTTLE_LIMIT = '1000';
process.env.BUSINESS_TIMEZONE = 'Asia/Bishkek';
