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
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
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
@ApiBearerAuth()
@Controller()
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Roles(UserRole.accountant)
  @RequireEmailCode('transaction.create')
  @Post('transactions')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateTransactionDto, @Req() req: Request) {
    return this.accounting.create(actor, dto, ctxOf(req));
  }

  @Roles(UserRole.director, UserRole.accountant)
  @Get('transactions')
  list(@Query() query: ListTransactionsQueryDto) {
    return this.accounting.list(query);
  }

  @Roles(UserRole.director, UserRole.accountant)
  @Get('transactions/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.accounting.get(id);
  }

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

  /** Receipt / act scan (PDF, JPEG, PNG). */
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
