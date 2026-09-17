import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'dotenv';

/**
 * Hard safety gate for test/real-db.e2e-spec.ts. That suite TRUNCATEs every
 * table, so it must never touch the working database. Every entry point
 * (jest globalSetup, setupFiles, the spec itself, the truncate helper)
 * calls this and refuses to continue on any doubt.
 */

/** Databases that are never acceptable as a test target, whatever the URL says. */
const PROTECTED_DATABASE_NAMES = new Set(['uzz_crm']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

interface DbIdentity {
  host: string;
  port: string;
  name: string;
}

function identify(url: string): DbIdentity {
  const parsed = new URL(url.replace(/^"|"$/g, ''));
  const host = LOCAL_HOSTS.has(parsed.hostname) ? 'localhost' : parsed.hostname;
  return { host, port: parsed.port || '5432', name: decodeURIComponent(parsed.pathname.replace(/^\//, '')) };
}

function sameDatabase(a: DbIdentity, b: DbIdentity): boolean {
  return a.host === b.host && a.port === b.port && a.name === b.name;
}

function readDotEnv(): Record<string, string> {
  const path = join(__dirname, '..', '..', '.env');
  return existsSync(path) ? parse(readFileSync(path)) : {};
}

/**
 * @param workingDatabaseUrls additional URLs the test DB must differ from
 *   (e.g. process.env.DATABASE_URL captured before the test overrides it).
 */
export function resolveSafeTestDatabaseUrl(workingDatabaseUrls: Array<string | undefined> = []): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[real-db guard] Refusing to run: NODE_ENV=production.');
  }

  const dotEnv = readDotEnv();
  const testUrl = process.env.DATABASE_URL_TEST ?? dotEnv.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error('[real-db guard] DATABASE_URL_TEST is not set. Refusing to run against any database.');
  }

  const test = identify(testUrl);

  if (PROTECTED_DATABASE_NAMES.has(test.name)) {
    throw new Error(`[real-db guard] Refusing to run: "${test.name}" is a protected working database.`);
  }
  if (!test.name.endsWith('_test')) {
    throw new Error(`[real-db guard] Refusing to run: test database name "${test.name}" must end with "_test".`);
  }

  for (const candidate of [dotEnv.DATABASE_URL, ...workingDatabaseUrls]) {
    if (candidate && sameDatabase(identify(candidate), test)) {
      throw new Error(
        '[real-db guard] Refusing to run: DATABASE_URL_TEST points at the same database as DATABASE_URL.',
      );
    }
  }

  return testUrl.replace(/^"|"$/g, '');
}

/** Throws unless the URL the process is actually connected to is the vetted test DB. */
export function assertConnectedToTestDatabase(): void {
  const safe = resolveSafeTestDatabaseUrl();
  const actual = process.env.DATABASE_URL;
  if (!actual || !sameDatabase(identify(actual), identify(safe))) {
    throw new Error('[real-db guard] process.env.DATABASE_URL is not the vetted test database.');
  }
}
