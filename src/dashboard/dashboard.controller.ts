import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsOptional, IsString, Matches } from 'class-validator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ISO_DATE_PATTERN } from '../common/business-calendar.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

export class OptionalDateRangeDto {
  /** Default: first day of the current month. */
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  /** Default: today. */
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Director and both investors: identical aggregated view. */
  @Roles(UserRole.director, UserRole.investor)
  @Get('dashboard')
  summary(@Query() q: OptionalDateRangeDto) {
    return this.dashboard.summary(q.from, q.to);
  }

  @Roles(UserRole.director, UserRole.head_of_sales)
  @Get('analytics/sales')
  sales(@CurrentUser() actor: AuthenticatedUser, @Query() q: OptionalDateRangeDto) {
    return this.dashboard.salesAnalytics(actor, q.from, q.to);
  }
}
