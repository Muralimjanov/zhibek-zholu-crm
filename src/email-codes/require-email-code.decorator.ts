import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { EMAIL_CODE_ACTIONS, EMAIL_CODE_HEADER, EMAIL_CODE_ID_HEADER, EmailCodeAction } from './email-code-actions';

export const EMAIL_CODE_KEY = 'requireEmailCode';

/**
 * The request must carry a code from POST /email-codes for this action
 * (and, if the action has a resourceParam, for this route parameter value).
 * Enforced by EmailCodeInterceptor after authentication and RBAC.
 */
export const RequireEmailCode = (action: EmailCodeAction) =>
  applyDecorators(
    SetMetadata(EMAIL_CODE_KEY, action),
    ApiHeader({
      name: EMAIL_CODE_ID_HEADER,
      required: true,
      description: `challengeId из POST /email-codes (action="${action}": ${EMAIL_CODE_ACTIONS[action].label})`,
    }),
    ApiHeader({ name: EMAIL_CODE_HEADER, required: true, description: 'Код из письма' }),
  );
