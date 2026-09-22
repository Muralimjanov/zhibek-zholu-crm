import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ctxOf } from '../common/request-context';
import { AssignLeadDto, ConvertLeadDto, CreateLeadDto, ListLeadsQueryDto } from './leads.dto';
import { LeadsService } from './leads.service';

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @ApiOperation({
    summary: 'Зарегистрировать обращение (форма ресепшена)',
    description:
      'Ресепшен заполняет форму со слов клиента: имя, фамилия, телефон и нужная площадь. ' +
      'Клиент подтверждает согласие на обработку персональных данных прямо на форме.',
  })
  @Roles(UserRole.reception)
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateLeadDto, @Req() req: Request) {
    return this.leads.create(actor, dto, ctxOf(req));
  }

  @ApiOperation({
    summary: 'Список обращений',
    description:
      'Ресепшен видит только свои записи, менеджер — назначенные ему, начальник продаж — ' +
      'нераспределённые и лиды своей команды, директор — все (только чтение).',
  })
  @Roles(UserRole.director, UserRole.head_of_sales, UserRole.sales_manager, UserRole.reception)
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListLeadsQueryDto) {
    return this.leads.list(actor, query);
  }

  @Roles(UserRole.director, UserRole.head_of_sales, UserRole.sales_manager, UserRole.reception)
  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.leads.get(actor, id, ctxOf(req));
  }

  @ApiOperation({ summary: 'Назначить менеджера', description: 'Только начальник продаж и только менеджеру своей команды.' })
  @Roles(UserRole.head_of_sales)
  @Patch(':id/assign')
  assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignLeadDto,
    @Req() req: Request,
  ) {
    return this.leads.assign(actor, id, dto, ctxOf(req));
  }

  @ApiOperation({ summary: 'Отказ по обращению', description: 'Клиент отказался или обращение нецелевое.' })
  @Roles(UserRole.head_of_sales, UserRole.sales_manager)
  @Patch(':id/reject')
  reject(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.leads.reject(actor, id, ctxOf(req));
  }

  @ApiOperation({
    summary: 'Превратить обращение в бронь',
    description:
      'Имя, телефон и площадь переносятся из лида. Паспорт и подтверждение согласия ' +
      'покупателя менеджер добавляет при встрече — без них бронь создать нельзя.',
  })
  @ApiOkResponse({ description: 'Создана бронь, лид получил статус converted' })
  @Roles(UserRole.head_of_sales, UserRole.sales_manager)
  @Post(':id/convert')
  @HttpCode(HttpStatus.CREATED)
  convert(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertLeadDto,
    @Req() req: Request,
  ) {
    return this.leads.convert(actor, id, dto, ctxOf(req));
  }
}
