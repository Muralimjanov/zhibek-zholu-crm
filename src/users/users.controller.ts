import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuditResult, StoredFilePurpose } from '@prisma/client';
import { Request, Response } from 'express';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipConsent } from '../common/decorators/skip-consent.decorator';
import { ctxOf } from '../common/request-context';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { FileStorageService } from '../files/file-storage.service';
import { sendPrivateFile } from '../files/file-response';

/**
 * Account CREATION and DISABLE live in ConfirmationsController
 * (POST /confirmations/users, POST /confirmations/users/:id/disable) -
 * both require Director email-code approval before taking effect.
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly files: FileStorageService,
    private readonly audit: AuditService,
  ) {}

  /** Director: all accounts. Head of sales: own team ("Team" screen). */
  @Get()
  async list(@CurrentUser() actor: AuthenticatedUser): Promise<UserResponseDto[]> {
    const users = await this.usersService.listVisibleUsers(actor);
    return users.map((u) => this.usersService.toResponse(u));
  }

  @SkipConsent()
  @Patch('me')
  async updateOwnProfile(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateOwnProfile(actor, dto, ctxOf(req));
    return this.usersService.toResponse(user);
  }

  /** Profile photo: JPEG, PNG or WebP; stored encrypted, served only to authorised users. */
  @SkipConsent()
  @Put('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  async uploadAvatar(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    const stored = await this.files.store(StoredFilePurpose.avatar, actor.id, file);
    const { previousFileId, user } = await this.usersService.setAvatar(actor.id, stored.id);
    await this.files.remove(previousFileId);
    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.USER_AVATAR_UPDATED,
      entityType: 'User',
      entityId: actor.id,
      result: AuditResult.success,
      ...ctxOf(req),
      metadata: { fileId: stored.id },
    });
    return this.usersService.toResponse(user);
  }

  @SkipConsent()
  @Delete('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAvatar(@CurrentUser() actor: AuthenticatedUser, @Req() req: Request): Promise<void> {
    const { previousFileId } = await this.usersService.setAvatar(actor.id, null);
    await this.files.remove(previousFileId);
    await this.audit.record({
      actorUserId: actor.id,
      action: AuditAction.USER_AVATAR_UPDATED,
      entityType: 'User',
      entityId: actor.id,
      result: AuditResult.success,
      ...ctxOf(req),
    });
  }

  @Get(':id')
  async findOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.getVisibleUserOrThrow(actor, id);
    return this.usersService.toResponse(user);
  }

  /** Same visibility rule as the profile itself. */
  @Get(':id/avatar')
  async avatar(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.usersService.getVisibleUserOrThrow(actor, id);
    if (!user.avatarFileId) throw new NotFoundException('FILE_NOT_FOUND');
    const file = await this.files.read(user.avatarFileId);
    if (file.record.purpose !== StoredFilePurpose.avatar) throw new ForbiddenException('AUTH_FORBIDDEN');
    return sendPrivateFile(res, file, { inline: true, baseName: 'avatar' });
  }
}
