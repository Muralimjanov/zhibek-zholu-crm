import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { FieldCipher } from './field-cipher.service';
import { BlindIndexService } from './blind-index.service';

@Global()
@Module({
  providers: [EncryptionService, FieldCipher, BlindIndexService],
  exports: [EncryptionService, FieldCipher, BlindIndexService],
})
export class CryptoModule {}
