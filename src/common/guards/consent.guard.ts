import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_CONSENT_KEY } from '../decorators/skip-consent.decorator';
import { ConsentService } from '../../consent/consent.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

/**
 * Blocks business endpoints (403 CONSENT_REQUIRED) until the authenticated
 * user has accepted the current version of every required legal document.
 * Runs after JwtAuthGuard. Login, session, legal documents, consent and own
 * profile endpoints opt out with @SkipConsent().
 */
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly consents: ConsentService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CONSENT_KEY, targets)) return true;

    const user = context.switchToHttp().getRequest().user as AuthenticatedUser | undefined;
    if (!user) return true; // JwtAuthGuard already rejected unauthenticated requests.

    if (!(await this.consents.hasAllRequired(user.id))) {
      throw new ForbiddenException('CONSENT_REQUIRED');
    }
    return true;
  }
}
