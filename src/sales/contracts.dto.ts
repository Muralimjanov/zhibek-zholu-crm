import { IntersectionType } from '@nestjs/swagger';
import { ContractStatus } from '@prisma/client';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { DECIMAL2_PATTERN, TYIYN_PATTERN } from '../common/money';
import { BuyerConsentDto, BuyerContactFieldsDto, PASSPORT_PATTERN, PHONE_PATTERN } from './buyer-pii';

export class ContractTermsDto {
  /** m², up to 2 decimals. */
  @IsString()
  @Matches(DECIMAL2_PATTERN, { message: 'areaSqm must be a positive decimal with up to 2 places' })
  areaSqm!: string;

  /** Price per m² in tyiyn as an integer string ("5000000" = 50 000 KGS). */
  @IsString()
  @Matches(TYIYN_PATTERN, { message: 'pricePerSqmTyiyn must be a non-negative integer string (tyiyn)' })
  pricePerSqmTyiyn!: string;

  /** Percent, default "30". */
  @IsOptional()
  @IsString()
  @Matches(DECIMAL2_PATTERN, { message: 'depositPercent must be a decimal with up to 2 places' })
  depositPercent?: string;
}

export class CreateContractDto extends IntersectionType(BuyerContactFieldsDto, BuyerConsentDto, ContractTermsDto) {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}

/**
 * total_amount / deposit_amount are NOT accepted: they are always recomputed
 * on the backend from areaSqm × pricePerSqm and depositPercent (TZ).
 */
export class UpdateContractDto {
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
  @MinLength(1)
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone may contain digits, spaces, + ( ) - only' })
  phone?: string;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL2_PATTERN)
  areaSqm?: string;

  @IsOptional()
  @IsString()
  @Matches(TYIYN_PATTERN)
  pricePerSqmTyiyn?: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL2_PATTERN)
  depositPercent?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}

export class MarkDepositDto {
  @IsBoolean()
  paid!: boolean;
}

export class ListContractsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(Object.values(ContractStatus))
  status?: ContractStatus;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsString()
  @Matches(PASSPORT_PATTERN)
  passportNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN)
  phone?: string;
}
