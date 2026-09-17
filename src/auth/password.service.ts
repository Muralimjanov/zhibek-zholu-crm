import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class PasswordService {
  constructor(private readonly config: AppConfigService) {}

  async hash(plain: string): Promise<string> {
    const opts = this.config.argon2Options;
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: opts.memoryCost,
      timeCost: opts.timeCost,
      parallelism: opts.parallelism,
    });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Malformed hash, algorithm mismatch, etc. - treat as verification
      // failure, never throw a distinguishing error to the caller.
      return false;
    }
  }
}
