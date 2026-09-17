import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { UserRole } from '@prisma/client';
import { ConfirmationsService } from './confirmations.service';
import { ConfirmActionDto } from './dto/confirm-action.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('confirmations')
@ApiBearerAuth()
@Controller('confirmations')
export class ConfirmationsController {
  constructor(
    private readonly confirmationsService: ConfirmationsService,
    private readonly usersService: UsersService,
  ) {}

  // Any authenticated user may attempt to initiate; UsersService.prepareX
  // enforces the real role-creation / disable-permission rules and throws
  // immediately (no PendingAction, no email) on a forbidden attempt.
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('users')
  async initiateCreateUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateUserDto,
    @Req() req: Request,
  ) {
    return this.confirmationsService.initiateCreateUser(actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @HttpCode(HttpStatus.ACCEPTED)
  @Post('users/:id/disable')
  async initiateDisableUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.confirmationsService.initiateDisableUser(actor, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // Strict per-route limit on top of the global throttle: this is exactly
  // the endpoint an attacker would hammer to brute-force a code.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Roles(UserRole.director)
  @Post(':id/confirm')
  async confirm(
    @CurrentUser() director: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmActionDto,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    const result = await this.confirmationsService.confirm(director, id, dto.code, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return this.usersService.toResponse(result);
  }

  @Roles(UserRole.director)
  @Post(':id/reject')
  async reject(@CurrentUser() director: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.confirmationsService.reject(director, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return { success: true };
  }

  // Fallback for when email delivery is unavailable/unconfigured - a
  // Director can still see and act on pending approvals from inside the
  // app itself. Never includes the code or the raw payload.
  @Roles(UserRole.director)
  @Get('pending')
  async listPending() {
    return this.confirmationsService.listPending();
  }
}
