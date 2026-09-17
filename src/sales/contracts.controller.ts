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
import { CreateContractDto, ListContractsQueryDto, MarkDepositDto, UpdateContractDto } from './contracts.dto';
import { ContractsService } from './contracts.service';

const SELLERS = [UserRole.director, UserRole.head_of_sales, UserRole.sales_manager];

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Roles(...SELLERS)
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateContractDto, @Req() req: Request) {
    return this.contracts.create(actor, dto, ctxOf(req));
  }

  /** Accountant receives a finance-only view without buyer PII. */
  @Roles(...SELLERS, UserRole.accountant)
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListContractsQueryDto, @Req() req: Request) {
    return this.contracts.list(actor, query, ctxOf(req));
  }

  @Roles(...SELLERS, UserRole.accountant)
  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.contracts.get(actor, id, ctxOf(req));
  }

  @Roles(...SELLERS)
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
    @Req() req: Request,
  ) {
    return this.contracts.update(actor, id, dto, ctxOf(req));
  }

  @Roles(...SELLERS, UserRole.accountant)
  @RequireEmailCode('contract.deposit')
  @Post(':id/deposit')
  markDeposit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkDepositDto,
    @Req() req: Request,
  ) {
    return this.contracts.markDeposit(actor, id, dto.paid, ctxOf(req));
  }

  /** Upload/replace the signed contract document (PDF, JPEG or PNG). */
  @Roles(...SELLERS)
  @RequireEmailCode('contract.file')
  @Put(':id/file')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  uploadFile(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    return this.contracts.attachFile(actor, id, file, ctxOf(req));
  }

  @Roles(...SELLERS)
  @Get(':id/file')
  async downloadFile(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.contracts.downloadFile(actor, id, ctxOf(req));
    return sendPrivateFile(res, file, { baseName: `contract-${id}` });
  }

  @Roles(UserRole.director, UserRole.head_of_sales)
  @RequireEmailCode('contract.delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.contracts.remove(actor, id, ctxOf(req));
  }
}
