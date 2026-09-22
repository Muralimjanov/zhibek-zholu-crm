import { Prisma, PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import { resolve, sep } from 'path';
import { gunzipSync, gzipSync } from 'zlib';

/**
 * Logical snapshot of the whole CRM database (+ encrypted file blobs + the
 * application keys needed to read it) - independent of the PostgreSQL
 * version, so it restores into any fresh database with the same migrations.
 *
 * Deliberately NOT included: refresh tokens and email codes (short-lived
 * secrets; everybody simply signs in again after a restore).
 */
export const BACKUP_TABLES = [
  // Order = restore order (foreign keys). User self/file references are
  // restored in a second pass.
  'User',
  'StoredFile',
  'ConsentRecord',
  'PendingAction',
  'Booking',
  // Лид ссылается на User и на Booking, поэтому идёт после них.
  'Lead',
  'Contract',
  'Shift',
  'DayOff',
  'PayrollSettings',
  'PayrollEntry',
  'Transaction',
  'AccountingPeriod',
  'DailyReport',
  'AuditEvent',
] as const;

export const BACKUP_EXCLUDED_TABLES = ['RefreshToken', 'EmailCode'] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
type Row = Record<string, unknown>;

/** Columns restored after all rows exist (cycles: User <-> User, User <-> StoredFile). */
const USER_DEFERRED_COLUMNS = ['createdById', 'teamLeadId', 'avatarFileId'] as const;
const STORAGE_KEY_PATTERN = /^[a-f0-9]{64}$/;

export interface BackupSnapshot {
  meta: {
    format: 'uzz-crm-backup';
    version: 1;
    createdAt: string;
    migrations: string[];
    counts: Record<string, number>;
    missingFiles: string[];
  };
  /** Values needed to decrypt the restored data (ENCRYPTION_KEY_*, BLIND_INDEX_KEY_V1). */
  keys: Record<string, string>;
  tables: Record<BackupTable, Row[]>;
  /** Encrypted-at-rest file bytes exactly as on disk, base64. */
  files: Array<{ storageKey: string; data: string }>;
}

function delegate(client: Prisma.TransactionClient | PrismaClient, table: string) {
  const name = table.charAt(0).toLowerCase() + table.slice(1);
  return (client as unknown as Record<string, { findMany(args?: unknown): Promise<Row[]>; createMany(args: unknown): Promise<unknown>; count(): Promise<number> }>)[name];
}

function jsonColumns(table: string): Set<string> {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === table);
  if (!model) throw new Error(`Unknown model ${table}`);
  return new Set(model.fields.filter((f) => f.type === 'Json').map((f) => f.name));
}

export function encodeValue(value: unknown): unknown {
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Prisma.Decimal.isDecimal(value)) return { $decimal: (value as Prisma.Decimal).toString() };
  return value;
}

export function decodeValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1) {
      const v = (value as Record<string, string>)[keys[0]];
      if (keys[0] === '$bigint') return BigInt(v);
      if (keys[0] === '$date') return new Date(v);
      if (keys[0] === '$decimal') return v;
    }
  }
  return value;
}

function mapRow(row: Row, fn: (v: unknown) => unknown): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k] = fn(v);
  return out;
}

export async function createSnapshot(
  prisma: PrismaClient,
  opts: { storageDir: string; keys: Record<string, string>; now?: Date },
): Promise<BackupSnapshot> {
  const tables = {} as Record<BackupTable, Row[]>;
  let migrations: string[] = [];

  // One REPEATABLE READ transaction = a consistent point-in-time view.
  await prisma.$transaction(
    async (tx) => {
      for (const table of BACKUP_TABLES) {
        const rows = await delegate(tx, table).findMany({ orderBy: { [primaryKey(table)]: 'asc' } });
        tables[table] = rows.map((r) => mapRow(r, encodeValue));
      }
      const applied = await tx.$queryRawUnsafe<Array<{ migration_name: string }>>(
        'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
      );
      migrations = applied.map((m) => m.migration_name);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 300_000, maxWait: 30_000 },
  );

  const root = resolve(opts.storageDir);
  const files: BackupSnapshot['files'] = [];
  const missingFiles: string[] = [];
  for (const row of tables.StoredFile) {
    const storageKey = String(row.storageKey);
    if (!STORAGE_KEY_PATTERN.test(storageKey)) continue;
    try {
      files.push({ storageKey, data: (await fs.readFile(resolve(root, storageKey))).toString('base64') });
    } catch {
      missingFiles.push(String(row.id));
    }
  }

  const counts: Record<string, number> = {};
  for (const table of BACKUP_TABLES) counts[table] = tables[table].length;

  return {
    meta: {
      format: 'uzz-crm-backup',
      version: 1,
      createdAt: (opts.now ?? new Date()).toISOString(),
      migrations,
      counts,
      missingFiles,
    },
    keys: opts.keys,
    tables,
    files,
  };
}

function primaryKey(table: string): string {
  return table === 'AccountingPeriod' ? 'period' : 'id';
}

export function serializeSnapshot(snapshot: BackupSnapshot): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(snapshot), 'utf8'), { level: 9 });
}

export function parseSnapshot(gzipped: Buffer): BackupSnapshot {
  const snapshot = JSON.parse(gunzipSync(gzipped).toString('utf8')) as BackupSnapshot;
  if (snapshot?.meta?.format !== 'uzz-crm-backup' || snapshot.meta.version !== 1) {
    throw new Error('Unsupported snapshot format');
  }
  return snapshot;
}

/**
 * Restores a snapshot into an EMPTY database (migrations already applied)
 * and writes the file blobs into storageDir. Refuses to touch a database
 * that already contains data - a restore never overwrites anything.
 */
export async function restoreSnapshot(
  prisma: PrismaClient,
  snapshot: BackupSnapshot,
  opts: { storageDir: string },
): Promise<Record<string, number>> {
  for (const table of BACKUP_TABLES) {
    if ((await delegate(prisma, table).count()) > 0) {
      throw new Error(`Target database is not empty (table ${table} has rows) - restore refused`);
    }
  }

  const applied = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  );
  const appliedNames = new Set(applied.map((m) => m.migration_name));
  const missing = snapshot.meta.migrations.filter((m) => !appliedNames.has(m));
  if (missing.length > 0) {
    throw new Error(`Target database lacks migrations from the backup: ${missing.join(', ')} - run "prisma migrate deploy" first`);
  }

  const restored: Record<string, number> = {};
  await prisma.$transaction(
    async (tx) => {
      for (const table of BACKUP_TABLES) {
        const json = jsonColumns(table);
        let rows = (snapshot.tables[table] ?? []).map((r) =>
          mapRow(r, decodeValue),
        );
        rows = rows.map((r) => {
          const out = { ...r };
          for (const col of json) if (out[col] === null) out[col] = Prisma.DbNull;
          if (table === 'User') for (const col of USER_DEFERRED_COLUMNS) out[col] = null;
          return out;
        });
        for (let i = 0; i < rows.length; i += 500) {
          await delegate(tx, table).createMany({ data: rows.slice(i, i + 500) });
        }
        restored[table] = rows.length;
      }
      for (const raw of snapshot.tables.User ?? []) {
        const row = mapRow(raw, decodeValue);
        const data: Row = {};
        for (const col of USER_DEFERRED_COLUMNS) if (row[col] !== null && row[col] !== undefined) data[col] = row[col];
        if (Object.keys(data).length > 0) {
          await tx.user.update({ where: { id: String(row.id) }, data });
        }
      }
    },
    { timeout: 600_000, maxWait: 30_000 },
  );

  const root = resolve(opts.storageDir);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  for (const file of snapshot.files) {
    if (!STORAGE_KEY_PATTERN.test(file.storageKey)) continue;
    const path = resolve(root, file.storageKey);
    if (!path.startsWith(root + sep)) continue;
    await fs.writeFile(path, Buffer.from(file.data, 'base64'), { mode: 0o600 });
  }
  restored.files = snapshot.files.length;
  return restored;
}
