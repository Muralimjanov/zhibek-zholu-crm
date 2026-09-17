import { StoredFilePurpose } from '@prisma/client';

export type AllowedMime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Detects the real type from magic bytes. The client-declared Content-Type
 * and file extension are never trusted (SECURITY_SPEC.md "File upload
 * security"). Anything not recognised - SVG, HTML, executables, archives -
 * is rejected.
 */
export function detectMime(buffer: Buffer): AllowedMime | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** OPEN QUESTION #31: allowed file types - technical default below. */
export const ALLOWED_MIME_BY_PURPOSE: Record<StoredFilePurpose, AllowedMime[]> = {
  avatar: ['image/jpeg', 'image/png', 'image/webp'],
  contract_document: ['application/pdf', 'image/jpeg', 'image/png'],
  transaction_attachment: ['application/pdf', 'image/jpeg', 'image/png'],
};

export const EXTENSION_BY_MIME: Record<AllowedMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
