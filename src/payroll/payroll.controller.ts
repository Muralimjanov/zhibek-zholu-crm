import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireEmailCode } from '../email-codes/require-email-code.decorator';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ctxOf } from '../common/request-context';
import { GeneratePayrollDto, ListPayrollQueryDto, PayrollSettingsDto, PayrollSummaryQueryDto, UpdatePayrollEntryDto } from './payroll.dto';
import { PayrollService } from './payroll.service';

@ApiTags('payroll')
@ApiBearerAuth()
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Roles(UserRole.director, UserRole.accountant)
  @Get('settings')
  getSettings() {
    return this.payroll.getSettings();
  }

  @Roles(UserRole.accountant)
  @RequireEmailCode('payroll.settings.update')
  @Put('settings')
  putSettings(@CurrentUser() actor: AuthenticatedUser, @Body() dto: PayrollSettingsDto, @Req() req: Request) {
    return this.payroll.putSettings(actor, dto, ctxOf(req));
  }

  @Roles(UserRole.accountant)
  @Post('entries/generate')
  @HttpCode(HttpStatus.OK)
  generate(@CurrentUser() actor: AuthenticatedUser, @Body() dto: GeneratePayrollDto, @Req() req: Request) {
    return this.payroll.generate(actor, dto.period, ctxOf(req));
  }

  @ApiOperation({
    summary: 'Сводка по зарплате за месяц (отчётность директора)',
    description:
      'Итоги по фонду оплаты труда, налогу, штрафам и прогулам за период плюс ' +
      'построчные начисления. Только директор (решение владельца 22.09.2026).',
  })
  @Roles(UserRole.director)
  @Get('summary')
  summary(@CurrentUser() actor: AuthenticatedUser, @Query() query: PayrollSummaryQueryDto) {
    return this.payroll.summary(actor, query.period);
  }

  /** Sales managers see only their own entries ("Моя зарплата"). */
  @Roles(UserRole.director, UserRole.accountant, UserRole.sales_manager)
  @Get('entries')
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListPayrollQueryDto) {
    return this.payroll.list(actor, query);
  }

  @Roles(UserRole.director, UserRole.accountant, UserRole.sales_manager)
  @Get('entries/:id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.get(actor, id);
  }

  @Roles(UserRole.accountant)
  @Patch('entries/:id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollEntryDto,
    @Req() req: Request,
  ) {
    return this.payroll.update(actor, id, dto, ctxOf(req));
  }

  @Roles(UserRole.accountant)
  @RequireEmailCode('payroll.confirm')
  @Post('entries/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.payroll.confirm(actor, id, ctxOf(req));
  }

  // Удаление начисления было только у директора и убрано вместе с остальным
  // его редактированием (решение владельца 22.09.2026). Ошибочный черновик
  // бухгалтер правит через PATCH, подтверждённый остаётся в истории.
}
