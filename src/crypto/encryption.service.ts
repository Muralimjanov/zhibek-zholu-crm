import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { AppConfigService } from '../config/app-config.service';

export interface EncryptedPayload {
  /** Key version used, so old versions can still be decrypted after rotation. */
  keyVersion: string;
  /** base64 IV/nonce - unique per encryption operation. */
  iv: string;
  /** base64 ciphertext. */
  ciphertext: string;
  /** base64 GCM authentication tag. */
  authTag: string;
}

export interface EncryptedBuffer {
  keyVersion: string;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

/**
 * Application-level authenticated encryption (AES-256-GCM).
 *
 * - unique 96-bit nonce per operation;
 * - versioned keys (ENCRYPTION_KEY_<VERSION>), old versions stay decryptable;
 * - optional associated data (AAD) binds a ciphertext to its context (e.g.
 *   "Booking.passportNumber"), so a ciphertext copied into another column
 *   fails authentication instead of silently decrypting.
 *
 * Never used for passwords - passwords are hashed (Argon2id), not encrypted.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 12; // 96-bit nonce recommended for GCM

  constructor(private readonly config: AppConfigService) {}

  /** Fail fast at boot instead of on the first request that touches PII. */
  onModuleInit(): void {
    this.keyBufferFor(this.config.encryptionCurrentVersion);
  }

  private keyBufferFor(version: string): Buffer {
    const raw = this.config.encryptionKeyFor(version);
    if (!raw) {
      throw new Error(`Encryption key not configured for version "${version}"`);
    }
    const value = raw.startsWith('base64:') ? raw.slice('base64:'.length) : raw;
    const buf = Buffer.from(value, 'base64');
    if (buf.length !== 32) {
      throw new Error(
        `Encryption key "${version}" must decode to 32 bytes for AES-256-GCM, got ${buf.length}`,
      );
    }
    return buf;
  }

  encryptBuffer(plaintext: Buffer, aad?: string): EncryptedBuffer {
    const keyVersion = this.config.encryptionCurrentVersion;
    const key = this.keyBufferFor(keyVersion);
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, key, iv);
    if (aad !== undefined) cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { keyVersion, iv, authTag: cipher.getAuthTag(), ciphertext };
  }

  decryptBuffer(payload: EncryptedBuffer, aad?: string): Buffer {
    const key = this.keyBufferFor(payload.keyVersion);
    const decipher = createDecipheriv(this.algorithm, key, payload.iv);
    if (aad !== undefined) decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(payload.authTag);
    return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
  }

  encrypt(plaintext: string, aad?: string): EncryptedPayload {
    const out = this.encryptBuffer(Buffer.from(plaintext, 'utf8'), aad);
    return {
      keyVersion: out.keyVersion,
      iv: out.iv.toString('base64'),
      ciphertext: out.ciphertext.toString('base64'),
      authTag: out.authTag.toString('base64'),
    };
  }

  decrypt(payload: EncryptedPayload, aad?: string): string {
    return this.decryptBuffer(
      {
        keyVersion: payload.keyVersion,
        iv: Buffer.from(payload.iv, 'base64'),
        authTag: Buffer.from(payload.authTag, 'base64'),
        ciphertext: Buffer.from(payload.ciphertext, 'base64'),
      },
      aad,
    ).toString('utf8');
  }
}
