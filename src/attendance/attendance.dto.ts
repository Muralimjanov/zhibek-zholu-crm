import { ShiftStatus } from '@prisma/client';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ISO_DATE_PATTERN } from '../common/business-calendar.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

export class DateRangeQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class ListShiftsQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsIn(Object.values(ShiftStatus))
  status?: ShiftStatus;
}

/** Director-only correction ("Update (коррекция)"). */
export class CorrectShiftDto {
  @IsIn(Object.values(ShiftStatus))
  status!: ShiftStatus;

  @ValidateIf((o: CorrectShiftDto) => o.status !== ShiftStatus.missed)
  @IsDateString({ strict: true })
  openedAt?: string;

  @ValidateIf((o: CorrectShiftDto) => o.status === ShiftStatus.closed)
  @IsDateString({ strict: true })
  closedAt?: string;
}

export class CreateDayOffDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}

export class UpdateDayOffDto {
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  /** null clears the reason. */
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string | null;
}
