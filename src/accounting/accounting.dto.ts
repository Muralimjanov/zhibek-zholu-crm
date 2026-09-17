import { TransactionCategory, TransactionType } from '@prisma/client';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ISO_DATE_PATTERN } from '../common/business-calendar.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

export const INCOME_CATEGORIES: TransactionCategory[] = [
  TransactionCategory.sale_deposit,
  TransactionCategory.sale_full_payment,
  TransactionCategory.sale_installment,
  TransactionCategory.other_income,
];

export function categoryMatchesType(type: TransactionType, category: TransactionCategory): boolean {
  return (type === TransactionType.income) === INCOME_CATEGORIES.includes(category);
}

export class CreateTransactionDto {
  @IsIn(Object.values(TransactionType))
  type!: TransactionType;

  @IsIn(Object.values(TransactionCategory))
  category!: TransactionCategory;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  subcategory?: string;

  /** Positive integer amount in tyiyn. */
  @IsString()
  @Matches(/^[1-9]\d{0,15}$/, { message: 'amountTyiyn must be a positive integer string (tyiyn)' })
  amountTyiyn!: string;

  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @IsUUID()
  relatedContractId?: string;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsIn(Object.values(TransactionType))
  type?: TransactionType;

  @IsOptional()
  @IsIn(Object.values(TransactionCategory))
  category?: TransactionCategory;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  subcategory?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,15}$/, { message: 'amountTyiyn must be a positive integer string (tyiyn)' })
  amountTyiyn?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsUUID()
  relatedContractId?: string | null;
}

export class ListTransactionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsIn(Object.values(TransactionType))
  type?: TransactionType;

  @IsOptional()
  @IsIn(Object.values(TransactionCategory))
  category?: TransactionCategory;

  @IsOptional()
  @IsUUID()
  relatedContractId?: string;
}

export class DateRangeRequiredDto {
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'to must be YYYY-MM-DD' })
  to!: string;
}
