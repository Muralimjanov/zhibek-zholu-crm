import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ConsentService } from './consent.service';
import { RecordConsentDto } from './dto/record-consent.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipConsent } from '../common/decorators/skip-consent.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('consents')
@ApiBearerAuth()
@SkipConsent()
@Controller('consents')
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  /** Accept the CURRENT version of a document (see GET /legal/documents). */
  @Post()
  async record(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordConsentDto, @Req() req: Request) {
    return this.consentService.record({
      userId: user.id,
      policyType: dto.policyType,
      policyVersion: dto.policyVersion,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('me')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.consentService.listForUser(user.id);
  }

  /** Which required documents the current user still has to accept. */
  @Get('status')
  async status(@CurrentUser() user: AuthenticatedUser) {
    return this.consentService.status(user.id);
  }
}
