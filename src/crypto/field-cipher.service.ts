import { Injectable } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

const PREFIX = 'enc';

/**
 * Stores an encrypted value in a single TEXT column:
 *   enc:<keyVersion>:<iv b64>:<authTag b64>:<ciphertext b64>
 *
 * `context` (e.g. "Booking.passportNumber") is used as AES-GCM associated
 * data, so every call site must pass the same context for encrypt/decrypt.
 * Values without the prefix are rejected - plaintext never silently passes
 * through as if it were decrypted data.
 */
@Injectable()
export class FieldCipher {
  constructor(private readonly encryption: EncryptionService) {}

  encrypt(context: string, plaintext: string): string {
    const p = this.encryption.encrypt(plaintext, context);
    return [PREFIX, p.keyVersion, p.iv, p.authTag, p.ciphertext].join(':');
  }

  encryptNullable(context: string, plaintext: string | null | undefined): string | null {
    return plaintext === null || plaintext === undefined ? null : this.encrypt(context, plaintext);
  }

  decrypt(context: string, stored: string): string {
    const parts = stored.split(':');
    if (parts.length !== 5 || parts[0] !== PREFIX) {
      throw new Error(`Value for ${context} is not in encrypted format`);
    }
    const [, keyVersion, iv, authTag, ciphertext] = parts;
    return this.encryption.decrypt({ keyVersion, iv, authTag, ciphertext }, context);
  }

  decryptNullable(context: string, stored: string | null | undefined): string | null {
    return stored === null || stored === undefined ? null : this.decrypt(context, stored);
  }

  static isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(`${PREFIX}:`) && value.split(':').length === 5;
  }
}
