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
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiExtraModels, ApiOkResponse, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccountingPeriodDto, AccountingSummaryDto, TransactionPageDto, TransactionResponseDto } from './accounting.response.dto';
import { RequireEmailCode } from '../email-codes/require-email-code.decorator';
import { UserRole } from '@prisma/client';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ctxOf } from '../common/request-context';
import { sendPrivateFile } from '../files/file-response';
import { CreateTransactionDto, DateRangeRequiredDto, ListTransactionsQueryDto, UpdateTransactionDto } from './accounting.dto';
import { AccountingService } from './accounting.service';

@ApiTags('accounting')
@ApiExtraModels(TransactionResponseDto, AccountingSummaryDto, AccountingPeriodDto)
@ApiBearerAuth()
@Controller()
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @ApiOperation({
    summary: 'Создать операцию (только бухгалтер)',
    description: 'Требует код: POST /email-codes { "action": "transaction.create" } без resourceId. Бэкенд не создаёт операции сам — см. описание тега.',
  })
  @ApiResponse({ status: 201, type: TransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Валидация; CATEGORY_DOES_NOT_MATCH_TYPE; TRANSACTION_DATE_IN_FUTURE; ACCOUNTING_PERIOD_CLOSED; RELATED_CONTRACT_NOT_FOUND' })
  @Roles(UserRole.accountant)
  @RequireEmailCode('transaction.create')
  @Post('transactions')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateTransactionDto, @Req() req: Request) {
    return this.accounting.create(actor, dto, ctxOf(req));
  }

  @ApiOperation({ summary: 'Список операций (директор — чтение всех, бухгалтер — все)' })
  @ApiOkResponse({ type: TransactionPageDto })
  @Roles(UserRole.director, UserRole.accountant)
  @Get('transactions')
  list(@Query() query: ListTransactionsQueryDto) {
    return this.accounting.list(query);
  }

  @ApiOkResponse({ type: TransactionResponseDto })
  @Roles(UserRole.director, UserRole.accountant)
  @Get('transactions/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.accounting.get(id);
  }

  @ApiOperation({
    summary: 'Изменить операцию (бухгалтер, только свою и до закрытия месяца)',
    description: 'Требует код: POST /email-codes { "action": "transaction.update", "resourceId": "<id операции>" }.',
  })
  @ApiOkResponse({ type: TransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Валидация; CATEGORY_DOES_NOT_MATCH_TYPE; TRANSACTION_DATE_IN_FUTURE; ACCOUNTING_PERIOD_CLOSED' })
  @Roles(UserRole.accountant)
  @RequireEmailCode('transaction.update')
  @Patch('transactions/:id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
    @Req() req: Request,
  ) {
    return this.accounting.update(actor, id, dto, ctxOf(req));
  }

  @Roles(UserRole.director, UserRole.accountant)
  @RequireEmailCode('transaction.delete')
  @Delete('transactions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.accounting.remove(actor, id, ctxOf(req));
  }

  @ApiOperation({
    summary: 'Загрузить чек/акт к операции (только бухгалтер, своя операция, месяц не закрыт)',
    description:
      'multipart/form-data, поле `file`: PDF, JPEG или PNG, до 10 МБ (MAX_UPLOAD_BYTES). Тип определяется по содержимому файла, ' +
      'расширение и заголовок Content-Type клиента не учитываются. Повторная загрузка заменяет прежний файл (старый удаляется). ' +
      'Требует код: POST /email-codes { "action": "transaction.attachment", "resourceId": "<id операции>" }.',
  })
  @ApiOkResponse({ type: TransactionResponseDto, description: 'Операция с hasAttachment: true' })
  @ApiResponse({ status: 400, description: 'FILE_REQUIRED — поле file пустое; FILE_TYPE_NOT_ALLOWED — не PDF/JPEG/PNG по содержимому; ACCOUNTING_PERIOD_CLOSED' })
  @ApiResponse({ status: 404, description: 'TRANSACTION_NOT_FOUND или TRANSACTION_NOT_OWNED (операция другого бухгалтера)' })
  @ApiResponse({ status: 413, description: 'PAYLOAD_TOO_LARGE — файл больше 10 МБ' })
  @Roles(UserRole.accountant)
  @RequireEmailCode('transaction.attachment')
  @Put('transactions/:id/attachment')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  attach(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    return this.accounting.attach(actor, id, file, ctxOf(req));
  }

  @ApiOperation({
    summary: 'Скачать чек/акт (директор, бухгалтер)',
    description:
      'Отдаёт сам файл (бинарно), не JSON и не ссылку. Заголовки: Content-Type — определённый при загрузке тип ' +
      '(application/pdf, image/jpeg, image/png), Content-Disposition: attachment; filename="receipt-<id>.<ext>", ' +
      'X-Content-Type-Options: nosniff, Content-Security-Policy: default-src \'none\'; sandbox, Cache-Control: private, no-store. ' +
      'Код подтверждения не нужен, но каждое скачивание пишется в журнал аудита (FILE_DOWNLOADED).',
  })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiOkResponse({ description: 'Файл', schema: { type: 'string', format: 'binary' } })
  @ApiResponse({ status: 404, description: 'FILE_NOT_FOUND — у операции нет вложения или она недоступна' })
  @Roles(UserRole.director, UserRole.accountant)
  @Get('transactions/:id/attachment')
  async download(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.accounting.downloadAttachment(actor, id, ctxOf(req));
    return sendPrivateFile(res, file, { baseName: `receipt-${id}` });
  }

  @ApiOkResponse({ type: [AccountingPeriodDto], description: 'Закрытые месяцы' })
  @Roles(UserRole.director, UserRole.accountant)
  @Get('accounting/periods')
  periods() {
    return this.accounting.listPeriods();
  }

  /** Locks the month's transactions against edits by the accountant. */
  @Roles(UserRole.accountant)
  @RequireEmailCode('accounting.period.close')
  @Post('accounting/periods/:period/close')
  closePeriod(@CurrentUser() actor: AuthenticatedUser, @Param('period') period: string, @Req() req: Request) {
    return this.accounting.closePeriod(actor, period, ctxOf(req));
  }

  @ApiOperation({ summary: 'Итоги за период с разбивкой по всем 14 категориям (директор, бухгалтер)' })
  @ApiOkResponse({ type: AccountingSummaryDto })
  @ApiResponse({ status: 400, description: 'DATE_RANGE_INVALID; DATE_RANGE_TOO_LARGE (более 366 дней)' })
  @Roles(UserRole.director, UserRole.accountant)
  @Get('accounting/summary')
  summary(@Query() q: DateRangeRequiredDto) {
    return this.accounting.summary(q.from, q.to);
  }

  @Roles(UserRole.director, UserRole.accountant)
  @Get('accounting/export.xlsx')
  async export(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() q: DateRangeRequiredDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.accounting.exportXlsx(actor, q.from, q.to, ctxOf(req));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="accounting-${q.from}_${q.to}.xlsx"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(buffer);
  }
}
