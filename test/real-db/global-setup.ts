import { execSync } from 'child_process';
import { join } from 'path';
import { resolveSafeTestDatabaseUrl } from './guard';
import { MAILPIT_API } from './mailpit';

export default async function globalSetup(): Promise<void> {
  const testUrl = resolveSafeTestDatabaseUrl([process.env.DATABASE_URL]);

  // Creates the test database if needed and applies committed migrations
  // only (never `migrate dev` / `reset` here).
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });

  try {
    const res = await fetch(`${MAILPIT_API}/info`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    throw new Error(
      `[real-db] Mailpit is not reachable at ${MAILPIT_API} (${(err as Error).message}). ` +
        'Start it: see dev-tools/mailpit/README.md (macOS/Windows service on 127.0.0.1), or docker compose -f docker-compose.dev.yml up -d mailpit',
    );
  }
}
