import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { BusinessCalendar } from '../common/business-calendar.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ListDailyReportsQueryDto, RegenerateReportDto } from './reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('daily-reports')
@ApiBearerAuth()
@Controller('daily-reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly calendar: BusinessCalendar,
  ) {}

  /** Feed of daily reports, newest first. */
  @Roles(UserRole.director, UserRole.investor, UserRole.head_of_sales, UserRole.accountant)
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListDailyReportsQueryDto) {
    return this.reports.list(actor, query);
  }

  @Roles(UserRole.director, UserRole.investor, UserRole.head_of_sales, UserRole.accountant)
  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.get(actor, id);
  }

  /** Operational fallback (e.g. a report failed to generate): director only. */
  @Roles(UserRole.director)
  @Post('regenerate')
  async regenerate(@CurrentUser() actor: AuthenticatedUser, @Body() dto: RegenerateReportDto) {
    if (dto.date > this.calendar.today()) throw new BadRequestException('REPORT_DATE_IN_FUTURE');
    const report = await this.reports.generate(dto.type, dto.date, null, actor.id);
    return this.reports.toResponse(report);
  }
}
