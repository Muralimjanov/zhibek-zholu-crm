import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MANAGER_ID_CONVERT_NOTE } from './manager-assignment';
import { RequireEmailCode } from '../email-codes/require-email-code.decorator';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ctxOf } from '../common/request-context';
import { ConvertBookingDto, CreateBookingDto, ListBookingsQueryDto, UpdateBookingDto } from './bookings.dto';
import { BookingsService } from './bookings.service';
import { ContractsService } from './contracts.service';

const SELLERS = [UserRole.director, UserRole.head_of_sales, UserRole.sales_manager];
/**
 * Кто может менять данные. Решение владельца 22.09.2026: у директора
 * осталась только отчётность и аккаунты, поэтому в записи его нет.
 */
const SELLER_EDITORS = [UserRole.head_of_sales, UserRole.sales_manager];

@ApiTags('bookings')
@ApiBearerAuth()
@Roles(...SELLERS)
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly contracts: ContractsService,
  ) {}

  @ApiOperation({
    summary: 'Создать бронь (director, head_of_sales, sales_manager)',
    description: 'managerId: director - обязателен; head_of_sales - необязателен (по умолчанию он сам, допустим свой менеджер); sales_manager - не передавать. Подробно - в описании поля managerId.',
  })
  @ApiResponse({ status: 201, description: 'Бронь создана' })
  @ApiResponse({ status: 400, description: 'Валидация; MANAGER_ID_REQUIRED (director без managerId); MANAGER_INVALID (не активный продавец)' })
  @ApiResponse({ status: 403, description: 'AUTH_FORBIDDEN: роль без права или managerId вне допустимых (см. описание поля managerId); CONSENT_REQUIRED' })
  @Roles(...SELLER_EDITORS)
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateBookingDto, @Req() req: Request) {
    return this.bookings.create(actor, dto, ctxOf(req));
  }

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListBookingsQueryDto, @Req() req: Request) {
    return this.bookings.list(actor, query, ctxOf(req));
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.bookings.get(actor, id, ctxOf(req));
  }

  @Roles(...SELLER_EDITORS)
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
    @Req() req: Request,
  ) {
    return this.bookings.update(actor, id, dto, ctxOf(req));
  }

  @Roles(UserRole.head_of_sales)
  @RequireEmailCode('booking.delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.bookings.remove(actor, id, ctxOf(req));
  }

  /** Booking -> Contract ("оформить договор"). */
  @ApiOperation({ summary: 'Оформить договор из брони', description: MANAGER_ID_CONVERT_NOTE })
  @Roles(...SELLER_EDITORS)
  @Post(':id/convert')
  convert(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertBookingDto,
    @Req() req: Request,
  ) {
    return this.contracts.createFromBooking(actor, id, dto, ctxOf(req));
  }
}
