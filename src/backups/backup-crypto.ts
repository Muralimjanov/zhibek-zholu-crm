import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from 'crypto';

/**
 * Backup file format (".uzzbak"):
 *
 *   "UZZBAK1\n" | uint32BE header length | header JSON | ciphertext | GCM tag (16)
 *
 * The payload (gzip of the snapshot JSON) is encrypted with a random
 * AES-256-GCM key; that key is wrapped with the Director's RSA public key
 * (RSA-OAEP-SHA256). The server only ever holds the PUBLIC key, so neither
 * the server, the hosting provider nor a stolen agent token can read a
 * backup. The magic, length and header are authenticated as GCM AAD.
 */
export const BACKUP_MAGIC = Buffer.from('UZZBAK1\n', 'utf8');
const TAG_LENGTH = 16;

export interface BackupHeader {
  format: 'uzz-crm-backup';
  version: 1;
  createdAt: string;
  cipher: 'aes-256-gcm';
  keyWrap: 'rsa-oaep-sha256';
  wrappedKey: string;
  iv: string;
  /** SHA-256 of the DER public key - tells which private key opens the file. */
  publicKeySha256: string;
}

export function publicKeyFingerprint(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex');
}

export function encryptBackup(plaintext: Buffer, publicKeyPem: string, createdAt = new Date()): Buffer {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const wrappedKey = publicEncrypt(
    { key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    key,
  );
  const header: BackupHeader = {
    format: 'uzz-crm-backup',
    version: 1,
    createdAt: createdAt.toISOString(),
    cipher: 'aes-256-gcm',
    keyWrap: 'rsa-oaep-sha256',
    wrappedKey: wrappedKey.toString('base64'),
    iv: iv.toString('base64'),
    publicKeySha256: publicKeyFingerprint(publicKeyPem),
  };
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(headerBytes.length);
  const prefix = Buffer.concat([BACKUP_MAGIC, length, headerBytes]);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(prefix);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([prefix, ciphertext, cipher.getAuthTag()]);
}

export function readBackupHeader(file: Buffer): { header: BackupHeader; prefixLength: number } {
  if (file.length < BACKUP_MAGIC.length + 4 || !file.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new Error('Not a UZZ CRM backup file');
  }
  const headerLength = file.readUInt32BE(BACKUP_MAGIC.length);
  const start = BACKUP_MAGIC.length + 4;
  if (headerLength > 64 * 1024 || start + headerLength + TAG_LENGTH > file.length) {
    throw new Error('Backup file is truncated or corrupted');
  }
  const header = JSON.parse(file.subarray(start, start + headerLength).toString('utf8')) as BackupHeader;
  if (header.format !== 'uzz-crm-backup' || header.version !== 1) throw new Error('Unsupported backup format');
  return { header, prefixLength: start + headerLength };
}

/** Throws if the private key/passphrase is wrong or the file was modified. */
export function decryptBackup(file: Buffer, privateKeyPem: string, passphrase?: string): { header: BackupHeader; plaintext: Buffer } {
  const { header, prefixLength } = readBackupHeader(file);
  const privateKey = createPrivateKey({ key: privateKeyPem, format: 'pem', passphrase });
  const key = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(header.wrappedKey, 'base64'),
  );
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'base64'));
  decipher.setAAD(file.subarray(0, prefixLength));
  decipher.setAuthTag(file.subarray(file.length - TAG_LENGTH));
  const plaintext = Buffer.concat([decipher.update(file.subarray(prefixLength, file.length - TAG_LENGTH)), decipher.final()]);
  return { header, plaintext };
}
