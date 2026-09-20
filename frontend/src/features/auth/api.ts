import { apiRequest } from '@/lib/api/client'
import type {
  LoginRequest,
  LoginVerifyRequest,
  LogoutResponse,
  RefreshResponse,
  User,
} from '@/types/auth'

/**
 * Шаг 1 (API 0.2.0): токена и сессии здесь ещё нет, только challenge —
 * см. `src/features/auth/loginFlow.ts`. Тело ответа в OpenAPI не описано,
 * поэтому тип на границе — `unknown`, разбор отдельно.
 */
export function requestLogin(credentials: LoginRequest) {
  return apiRequest<unknown>('/auth/login', {
    method: 'POST',
    json: credentials,
  })
}

/** Шаг 2: код из письма. Тело ответа в OpenAPI тоже не описано. */
export function requestLoginVerify(input: LoginVerifyRequest) {
  return apiRequest<unknown>('/auth/login/verify', {
    method: 'POST',
    json: input,
  })
}

export function requestRefresh(csrfToken: string) {
  return apiRequest<RefreshResponse>('/auth/refresh', {
    method: 'POST',
    csrfToken,
  })
}

export function requestLogout(csrfToken: string) {
  return apiRequest<LogoutResponse>('/auth/logout', {
    method: 'POST',
    csrfToken,
  })
}

export function requestMe(token: string) {
  return apiRequest<User>('/auth/me', { token })
}

export function requestConsentStatus(token: string) {
  return apiRequest<unknown>('/consents/status', { token })
}
