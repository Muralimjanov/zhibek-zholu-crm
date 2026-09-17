import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
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
    ApiResponse({
      status: 403,
      description:
        'EMAIL_CODE_REQUIRED — нет заголовков с кодом; AUTH_FORBIDDEN — роль без права на действие; CONSENT_REQUIRED — не приняты юридические документы',
    }),
    ApiResponse({
      status: 401,
      description:
        'EMAIL_CODE_INVALID — неверный код, либо код выдан для другой записи/действия/пользователя; ' +
        'EMAIL_CODE_USED — код уже использован или заменён новым; EMAIL_CODE_EXPIRED — истёк (10 мин); ' +
        'EMAIL_CODE_LOCKED — 5 неверных попыток. В каждом случае нужен новый код: POST /email-codes. ' +
        'Код НЕ сгорает, если сам запрос отклонён с 4xx (валидация, закрытый месяц и т. п.) — его можно ввести снова.',
    }),
    ApiResponse({ status: 429, description: 'EMAIL_CODE_RATE_LIMITED — не больше 5 кодов одного вида за 15 минут' }),
  );
