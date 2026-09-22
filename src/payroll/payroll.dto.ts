import { PayrollEntryStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { PERIOD_PATTERN } from '../common/business-calendar.service';
import { DECIMAL2_PATTERN, TYIYN_PATTERN } from '../common/money';

export class PayrollSettingsDto {
  /** Fixed fine per missed shift, tyiyn. */
  @IsString()
  @Matches(TYIYN_PATTERN, { message: 'finePerMissedShiftTyiyn must be a non-negative integer string (tyiyn)' })
  finePerMissedShiftTyiyn!: string;

  /** Tax rate in percent, e.g. "10". */
  @IsString()
  @Matches(DECIMAL2_PATTERN, { message: 'taxRatePercent must be a decimal with up to 2 places' })
  taxRatePercent!: string;
}

export class GeneratePayrollDto {
  /** YYYY-MM */
  @IsString()
  @Matches(PERIOD_PATTERN, { message: 'period must be YYYY-MM' })
  period!: string;
}

export class UpdatePayrollEntryDto {
  @IsOptional()
  @IsString()
  @Matches(TYIYN_PATTERN, { message: 'baseSalaryTyiyn must be a non-negative integer string (tyiyn)' })
  baseSalaryTyiyn?: string;

  /** Manual correction before confirmation (TZ). */
  @IsOptional()
  @IsString()
  @Matches(TYIYN_PATTERN, { message: 'fineAmountTyiyn must be a non-negative integer string (tyiyn)' })
  fineAmountTyiyn?: string;
}

export class ListPayrollQueryDto {
  @IsOptional()
  @IsString()
  @Matches(PERIOD_PATTERN, { message: 'period must be YYYY-MM' })
  period?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn(Object.values(PayrollEntryStatus))
  status?: PayrollEntryStatus;
}

/** Период для сводки по зарплате в отчётности директора. */
export class PayrollSummaryQueryDto {
  @IsString()
  @Matches(PERIOD_PATTERN, { message: 'period must be YYYY-MM' })
  period!: string;
}
