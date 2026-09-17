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
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireEmailCode } from '../email-codes/require-email-code.decorator';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ctxOf } from '../common/request-context';
import { CorrectShiftDto, CreateDayOffDto, DateRangeQueryDto, ListShiftsQueryDto, UpdateDayOffDto } from './attendance.dto';
import { SHIFT_ROLES } from './attendance-access';
import { DayOffsService } from './day-offs.service';
import { ShiftsService } from './shifts.service';

@ApiTags('shifts')
@ApiBearerAuth()
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Roles(...SHIFT_ROLES)
  @Post('open')
  open(@CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    return this.shifts.open(actor, ctxOf(req));
  }

  /** Closing the accountant's / head of sales' shift generates the daily report. */
  @Roles(...SHIFT_ROLES)
  @Post('close')
  @HttpCode(HttpStatus.OK)
  close(@CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    return this.shifts.close(actor, ctxOf(req));
  }

  /** The caller's open shift or today's shift, if any. */
  @Roles(...SHIFT_ROLES)
  @Get('current')
  current(@CurrentUser() actor: AuthenticatedUser) {
    return this.shifts.current(actor);
  }

  @Roles(UserRole.director, UserRole.head_of_sales, UserRole.sales_manager, UserRole.accountant)
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListShiftsQueryDto) {
    return this.shifts.list(actor, query);
  }

  @Roles(UserRole.director)
  @RequireEmailCode('shift.update')
  @Patch(':id')
  correct(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrectShiftDto,
    @Req() req: Request,
  ) {
    return this.shifts.correct(actor, id, dto, ctxOf(req));
  }

  @Roles(UserRole.director)
  @RequireEmailCode('shift.delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.shifts.remove(actor, id, ctxOf(req));
  }
}

@ApiTags('day-offs')
@ApiBearerAuth()
@Controller('day-offs')
export class DayOffsController {
  constructor(private readonly dayOffs: DayOffsService) {}

  @Roles(UserRole.director, UserRole.head_of_sales)
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateDayOffDto, @Req() req: Request) {
    return this.dayOffs.create(actor, dto, ctxOf(req));
  }

  @Roles(UserRole.director, UserRole.head_of_sales, UserRole.sales_manager, UserRole.accountant)
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: DateRangeQueryDto) {
    return this.dayOffs.list(actor, query);
  }

  @Roles(UserRole.director, UserRole.head_of_sales)
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDayOffDto,
    @Req() req: Request,
  ) {
    return this.dayOffs.update(actor, id, dto, ctxOf(req));
  }

  @Roles(UserRole.director, UserRole.head_of_sales)
  @RequireEmailCode('day_off.delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.dayOffs.remove(actor, id, ctxOf(req));
  }
}
