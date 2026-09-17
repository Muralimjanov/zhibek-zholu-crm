import { DailyReportType } from '@prisma/client';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ISO_DATE_PATTERN } from '../common/business-calendar.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

export class ListDailyReportsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(Object.values(DailyReportType))
  type?: DailyReportType;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class RegenerateReportDto {
  @IsIn(Object.values(DailyReportType))
  type!: DailyReportType;

  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'date must be YYYY-MM-DD' })
  date!: string;
}
