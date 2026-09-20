import { apiRequest, type ApiRequestOptions } from '@/lib/api/client'
import { runConfirmedRequest } from './confirmedRequestCore'
import { authorizedRequest } from './session'
import { getAccessToken } from './session-store'

/**
 * Один защищённый запрос с одноразовым кодом: токен освежается заранее
 * дешёвым чтением `/auth/me` через обычный `authorizedRequest` (тот умеет
 * штатный одноразовый refresh на 401), а сам запрос с кодом идёт напрямую
 * через `apiRequest` с уже известным токеном — БЕЗ автоматического повтора
 * и без `clearSession()` по его собственному 401. `credentials: include`
 * сохраняется (это делает сам `apiRequest`); для multipart/`FormData` тела
 * `Content-Type` по-прежнему не выставляется вручную — см. `client.ts`.
 */
export function confirmedRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return runConfirmedRequest({
    refresh: () => authorizedRequest<unknown>('/auth/me'),
    send: () =>
      apiRequest<T>(endpoint, { ...options, token: getAccessToken() }),
  })
}
