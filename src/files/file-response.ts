import { StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { DecryptedFile } from './file-storage.service';
import { AllowedMime, EXTENSION_BY_MIME } from './file-type';

/**
 * Sends a decrypted private file with headers that stop the browser from
 * executing or caching it: the stored MIME type (detected from magic bytes,
 * not client input), nosniff, a sandboxing CSP, no-store, and
 * `attachment` for documents so PDFs are downloaded rather than rendered
 * in the application's origin.
 */
export function sendPrivateFile(res: Response, file: DecryptedFile, opts: { inline?: boolean; baseName: string }): StreamableFile {
  const mime = file.record.mimeType as AllowedMime;
  const fileName = `${opts.baseName}.${EXTENSION_BY_MIME[mime] ?? 'bin'}`;
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', String(file.content.length));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `${opts.inline ? 'inline' : 'attachment'}; filename="${fileName}"`);
  return new StreamableFile(file.content);
}
