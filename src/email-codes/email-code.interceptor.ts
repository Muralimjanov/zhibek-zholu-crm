import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmailCodePurpose } from '@prisma/client';
import { Request } from 'express';
import { catchError, from, mergeMap, Observable, throwError } from 'rxjs';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ctxOf } from '../common/request-context';
import { AppConfigService } from '../config/app-config.service';
import { EMAIL_CODE_ACTIONS, EMAIL_CODE_HEADER, EMAIL_CODE_ID_HEADER, EmailCodeAction } from './email-code-actions';
import { EmailCodesService } from './email-codes.service';
import { EMAIL_CODE_KEY } from './require-email-code.decorator';

/**
 * Enforces @RequireEmailCode. Runs after the guards (authentication, consent,
 * RBAC), so a forbidden request never burns a code; runs before pipes and the
 * handler, and gives the code back if the request is then rejected with a
 * 4xx - e.g. a validation error - so the user can fix the input and retry.
 * A 5xx keeps the code consumed (the action may have partly happened).
 */
@Injectable()
export class EmailCodeInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly codes: EmailCodesService,
    private readonly config: AppConfigService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const action = this.reflector.getAllAndOverride<EmailCodeAction | undefined>(EMAIL_CODE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action || this.config.actionEmailCodeBypassedForTests) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!req.user) throw new UnauthorizedException('AUTH_REQUIRED');

    const challengeId = headerValue(req, EMAIL_CODE_ID_HEADER);
    const code = headerValue(req, EMAIL_CODE_HEADER);
    if (!challengeId || !code) throw new ForbiddenException('EMAIL_CODE_REQUIRED');

    const param = EMAIL_CODE_ACTIONS[action].resourceParam;
    const resourceId = param ? String(req.params[param] ?? '') : null;

    const claim = await this.codes.consume({
      challengeId,
      code,
      purpose: EmailCodePurpose.action,
      userId: req.user.id,
      action,
      resourceId,
      ctx: ctxOf(req),
    });

    return next.handle().pipe(
      catchError((err: unknown) => {
        const clientError = err instanceof HttpException && err.getStatus() < 500;
        const release = clientError ? this.codes.release(claim).catch(() => undefined) : Promise.resolve();
        return from(release).pipe(mergeMap(() => throwError(() => err)));
      }),
    );
  }
}

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}
