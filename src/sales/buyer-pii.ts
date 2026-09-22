import { BadRequestException } from '@nestjs/common';
import { Equals, IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { currentVersion } from '../legal/legal-documents';

/** FieldCipher contexts (AES-GCM associated data) for buyer PII. */
export const BOOKING_PII = {
  fullName: 'Booking.fullName',
  passportNumber: 'Booking.passportNumber',
  phone: 'Booking.phone',
  email: 'Booking.email',
} as const;

export const CONTRACT_PII = {
  fullName: 'Contract.fullName',
  passportNumber: 'Contract.passportNumber',
  address: 'Contract.address',
  phone: 'Contract.phone',
  email: 'Contract.email',
} as const;

export const PASSPORT_PATTERN = /^[A-Za-z0-9А-Яа-яЁё][A-Za-z0-9А-Яа-яЁё \-.]{3,31}$/;
export const PHONE_PATTERN = /^\+?[0-9 ()-]{5,32}$/;

/** List views show only the last 4 characters of a passport number. */
export function maskPassport(value: string): string {
  const compact = value.replace(/\s/g, '');
  return compact.length <= 4 ? '****' : `${'*'.repeat(compact.length - 4)}${compact.slice(-4)}`;
}

export class BuyerContactFieldsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @Matches(PASSPORT_PATTERN, { message: 'passportNumber has an invalid format' })
  passportNumber!: string;

  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone may contain digits, spaces, + ( ) - only' })
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

/**
 * The manager confirms the buyer signed the consent form (GET
 * /legal/documents/buyer_personal_data_consent) for this exact version
 * before any buyer PII is stored.
 */
export class BuyerConsentDto {
  @IsBoolean()
  @Equals(true, { message: 'buyerConsentConfirmed must be true: buyer consent to personal data processing is required' })
  buyerConsentConfirmed!: boolean;

  @IsString()
  @MaxLength(64)
  buyerConsentVersion!: string;
}

export function assertBuyerConsentVersion(version: string): void {
  if (version !== currentVersion('buyer_personal_data_consent')) {
    throw new BadRequestException('BUYER_CONSENT_VERSION_NOT_CURRENT');
  }
}

/** FieldCipher contexts for a reception lead (first step of the funnel). */
export const LEAD_PII = {
  firstName: 'Lead.firstName',
  lastName: 'Lead.lastName',
  phone: 'Lead.phone',
  comment: 'Lead.comment',
} as const;
