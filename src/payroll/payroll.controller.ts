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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ctxOf } from '../common/request-context';
import { GeneratePayrollDto, ListPayrollQueryDto, PayrollSettingsDto, UpdatePayrollEntryDto } from './payroll.dto';
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
  @Post('entries/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.payroll.confirm(actor, id, ctxOf(req));
  }

  @Roles(UserRole.director)
  @Delete('entries/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.payroll.remove(actor, id, ctxOf(req));
  }
}
