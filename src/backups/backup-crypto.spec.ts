import { generateKeyPairSync } from 'crypto';
import { Prisma } from '@prisma/client';
import { decryptBackup, encryptBackup, readBackupHeader } from './backup-crypto';
import { BACKUP_EXCLUDED_TABLES, BACKUP_TABLES, decodeValue, encodeValue, parseSnapshot, serializeSnapshot } from './backup-snapshot';

const passphrase = 'a-very-long-test-passphrase';
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase },
});

describe('backup encryption', () => {
  const payload = Buffer.from('секретные данные CRM '.repeat(100));

  it('round-trips with the private key and passphrase; the file holds no plaintext', () => {
    const file = encryptBackup(payload, publicKey);
    expect(file.includes(Buffer.from('секретные'))).toBe(false);
    expect(decryptBackup(file, privateKey, passphrase).plaintext.equals(payload)).toBe(true);
  });

  it('fails with a wrong passphrase or another key pair', () => {
    const file = encryptBackup(payload, publicKey);
    expect(() => decryptBackup(file, privateKey, 'wrong-passphrase-123456')).toThrow();
    const other = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    expect(() => decryptBackup(file, other.privateKey)).toThrow();
  });

  it('detects tampering with the body or the authenticated header', () => {
    const file = encryptBackup(payload, publicKey);
    const body = Buffer.from(file);
    body[body.length - 40] ^= 1;
    expect(() => decryptBackup(body, privateKey, passphrase)).toThrow();

    const { prefixLength } = readBackupHeader(file);
    const header = Buffer.from(file);
    const text = header.subarray(12, prefixLength).toString('utf8').replace('"createdAt":"2', '"createdAt":"1');
    Buffer.from(text).copy(header, 12);
    expect(() => decryptBackup(header, privateKey, passphrase)).toThrow();
  });

  it('rejects files that are not backups', () => {
    expect(() => readBackupHeader(Buffer.from('hello world, definitely not a backup'))).toThrow('Not a UZZ CRM backup');
  });
});

describe('backup snapshot encoding', () => {
  it('preserves BigInt money, dates and decimals exactly', () => {
    const values = [123456789012345678n, new Date('2026-09-18T10:00:00.000Z'), new Prisma.Decimal('45.50')];
    const back = values.map((v) => decodeValue(JSON.parse(JSON.stringify(encodeValue(v)))));
    expect(back[0]).toBe(123456789012345678n);
    expect((back[1] as Date).toISOString()).toBe('2026-09-18T10:00:00.000Z');
    expect(back[2]).toBe('45.5');
  });

  it('covers every model except short-lived secrets (a new table must be added to backups)', () => {
    const models = Prisma.dmmf.datamodel.models.map((m) => m.name).sort();
    expect([...BACKUP_TABLES, ...BACKUP_EXCLUDED_TABLES].sort()).toEqual(models);
  });

  it('serializes to gzip and parses back', () => {
    const snapshot = {
      meta: { format: 'uzz-crm-backup', version: 1, createdAt: 'x', migrations: [], counts: {}, missingFiles: [] },
      keys: {},
      tables: {},
      files: [],
    } as never;
    expect(parseSnapshot(serializeSnapshot(snapshot))).toEqual(snapshot);
  });
});
