import { BadRequestException, Body, Controller, NotFoundException, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EmailCodePurpose } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipConsent } from '../common/decorators/skip-consent.decorator';
import { ctxOf } from '../common/request-context';
import { UsersService } from '../users/users.service';
import { EMAIL_CODE_ACTIONS } from './email-code-actions';
import { RequestEmailCodeDto } from './email-codes.dto';
import { EmailCodesService, IssuedEmailCode } from './email-codes.service';

@ApiTags('email-codes')
@ApiBearerAuth()
@Controller('email-codes')
export class EmailCodesController {
  constructor(
    private readonly codes: EmailCodesService,
    private readonly users: UsersService,
  ) {}

  /**
   * Step 1 of an important action: emails a one-time code to the caller.
   * Step 2: repeat the protected request with headers
   * `x-confirmation-id: <challengeId>` and `x-confirmation-code: <code>`.
   * Permissions are checked on the protected request itself.
   */
  @SkipConsent()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async request(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: RequestEmailCodeDto,
    @Req() req: Request,
  ): Promise<IssuedEmailCode> {
    const needsResource = EMAIL_CODE_ACTIONS[dto.action].resourceParam !== null;
    if (needsResource && !dto.resourceId) throw new BadRequestException('EMAIL_CODE_RESOURCE_REQUIRED');
    if (!needsResource && dto.resourceId) throw new BadRequestException('EMAIL_CODE_RESOURCE_NOT_ALLOWED');

    const user = await this.users.findById(actor.id);
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    return this.codes.issue({
      user,
      purpose: EmailCodePurpose.action,
      action: dto.action,
      resourceId: dto.resourceId ?? null,
      ctx: ctxOf(req),
    });
  }
}
