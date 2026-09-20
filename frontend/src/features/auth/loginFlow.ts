import type { LoginChallenge, LoginVerifyResponse, User } from '@/types/auth'

/**
 * Разбор ответов двухшагового входа (API 0.2.0).
 *
 * Оба тела в OpenAPI объявлены как пустой `object` — имена полей не
 * подтверждены схемой. Шаг 1 (`POST /auth/login`) назван дословно в
 * описании операции: "Returns { mfaRequired: true, challengeId, expiresAt,
 * emailHint }". Шаг 2 (`POST /auth/login/verify`) вообще не описан текстом;
 * форма здесь взята по аналогии с уже подтверждённым `POST /auth/refresh`
 * (`accessToken`, `csrfToken`) — это ПРЕДПОЛОЖЕНИЕ, не факт. Разбор поэтому
 * терпимый: отсутствующее поле не ломает страницу, а `readLoginVerifyResponse`
 * возвращает `null`, если токен вообще не найден, — тогда экран показывает
 * понятную ошибку вместо тихого перехода в кабинет без токена.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export function readLoginChallenge(payload: unknown): LoginChallenge | null {
  if (!isRecord(payload)) {
    return null
  }

  const challengeId = readString(payload.challengeId)

  if (!challengeId) {
    return null
  }

  return {
    mfaRequired: true,
    challengeId,
    expiresAt: readString(payload.expiresAt),
    emailHint: readString(payload.emailHint),
  }
}

export function readLoginVerifyResponse(
  payload: unknown,
): LoginVerifyResponse | null {
  if (!isRecord(payload)) {
    return null
  }

  const accessToken = readString(payload.accessToken)
  const csrfToken = readString(payload.csrfToken)

  if (!accessToken || !csrfToken || !isRecord(payload.user)) {
    return null
  }

  return {
    accessToken,
    csrfToken,
    expiresIn:
      typeof payload.expiresIn === 'number' ? payload.expiresIn : undefined,
    user: payload.user as unknown as User,
  }
}
