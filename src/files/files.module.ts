import { Global, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppConfigService } from '../config/app-config.service';
import { FileStorageService } from './file-storage.service';

/**
 * Upload limits are enforced by multer while streaming (before the whole
 * body is buffered): one file, bounded size, no extra fields.
 */
@Global()
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        storage: memoryStorage(),
        limits: { fileSize: config.maxUploadBytes, files: 1, fields: 0, parts: 1, headerPairs: 50 },
      }),
    }),
  ],
  providers: [FileStorageService],
  exports: [FileStorageService, MulterModule],
})
export class FilesModule {}
