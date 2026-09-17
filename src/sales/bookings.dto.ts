import { IntersectionType, PickType } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { DECIMAL2_PATTERN } from '../common/money';
import { BuyerConsentDto, BuyerContactFieldsDto, PASSPORT_PATTERN, PHONE_PATTERN } from './buyer-pii';

export class CreateBookingDto extends IntersectionType(BuyerContactFieldsDto, BuyerConsentDto) {
  /** m², up to 2 decimals, e.g. "60" or "45.5". */
  @IsString()
  @Matches(DECIMAL2_PATTERN, { message: 'desiredAreaSqm must be a positive decimal with up to 2 places' })
  desiredAreaSqm!: string;

  /** Ignored for sales managers (always themselves); required for directors. */
  @IsOptional()
  @IsUUID()
  managerId?: string;
}

export class UpdateBookingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(PASSPORT_PATTERN, { message: 'passportNumber has an invalid format' })
  passportNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone may contain digits, spaces, + ( ) - only' })
  phone?: string;

  /** null clears the email. */
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL2_PATTERN, { message: 'desiredAreaSqm must be a positive decimal with up to 2 places' })
  desiredAreaSqm?: string;

  /** `converted` is only reachable through POST /bookings/:id/convert. */
  @IsOptional()
  @IsIn([BookingStatus.active, BookingStatus.cancelled])
  status?: BookingStatus;

  /** Reassignment: head of sales (within team) and director only. */
  @IsOptional()
  @IsUUID()
  managerId?: string;
}

export class ListBookingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(Object.values(BookingStatus))
  status?: BookingStatus;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  /** Exact match via blind index (never a LIKE over decrypted data). */
  @IsOptional()
  @IsString()
  @Matches(PASSPORT_PATTERN)
  passportNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN)
  phone?: string;
}

export class ConvertBookingDto extends PickType(BuyerConsentDto, ['buyerConsentConfirmed', 'buyerConsentVersion'] as const) {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address!: string;

  /** Defaults to the booking's desired area. */
  @IsOptional()
  @IsString()
  @Matches(DECIMAL2_PATTERN)
  areaSqm?: string;

  /** Price per m² in tyiyn, e.g. "5000000" = 50 000 KGS. */
  @IsString()
  @Matches(/^(0|[1-9]\d{0,15})$/, { message: 'pricePerSqmTyiyn must be a non-negative integer string (tyiyn)' })
  pricePerSqmTyiyn!: string;

  /** Default 30. */
  @IsOptional()
  @IsString()
  @Matches(DECIMAL2_PATTERN)
  depositPercent?: string;
}
