import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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

@ApiTags('bookings')
@ApiBearerAuth()
@Roles(...SELLERS)
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly contracts: ContractsService,
  ) {}

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

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
    @Req() req: Request,
  ) {
    return this.bookings.update(actor, id, dto, ctxOf(req));
  }

  @Roles(UserRole.director, UserRole.head_of_sales)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.bookings.remove(actor, id, ctxOf(req));
  }

  /** Booking -> Contract ("оформить договор"). */
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
