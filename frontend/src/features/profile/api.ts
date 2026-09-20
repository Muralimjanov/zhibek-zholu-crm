import { confirmedRequest } from '@/features/auth/confirmedRequest'
import { authorizedRequest } from '@/features/auth/session'
import type { User } from '@/types/auth'

/**
 * Поля, которые разрешено менять через `PATCH /users/me`. С API 0.2.0
 * `UpdateProfileDto` содержит только `fullName` и nullable `phone` — `email`
 * сюда отправлять больше нельзя, лишнее поле в теле даёт 400. Смена почты —
 * отдельный сценарий, см. `startEmailChange`/`confirmEmailChange` ниже.
 */
export interface UpdateProfileInput {
  fullName?: string
  phone?: string | null
}

export const AVATAR_MAX_BYTES = 10 * 1024 * 1024
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function updateProfile(input: UpdateProfileInput) {
  return authorizedRequest<User>('/users/me', {
    method: 'PATCH',
    json: input,
  })
}

/**
 * Multipart: Content-Type с boundary проставляет браузер, вручную его
 * задавать нельзя.
 */
export function uploadAvatar(file: File) {
  const formData = new FormData()

  formData.append('file', file)

  return authorizedRequest<User>('/users/me/avatar', {
    method: 'PUT',
    body: formData,
  })
}

export function deleteAvatar() {
  return authorizedRequest<void>('/users/me/avatar', { method: 'DELETE' })
}

/** Картинка отдаётся только по Bearer-токену, поэтому грузим её как blob. */
export function fetchAvatarBlob(userId: string) {
  return authorizedRequest<Blob>(
    `/users/${encodeURIComponent(userId)}/avatar`,
    { responseType: 'blob' },
  )
}

export function validateAvatarFile(file: File): string | null {
  if (!AVATAR_MIME_TYPES.includes(file.type)) {
    return 'Допустимы только JPEG, PNG и WebP.'
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return 'Файл больше 10 МБ.'
  }

  return null
}

/**
 * Смена почты (API 0.2.0, три шага, два РАЗНЫХ кода):
 * 1. Код на ТЕКУЩИЙ адрес — `requestEmailCode('user.email.change')` из
 *    `@/features/auth/emailCodes`.
 * 2. `startEmailChange` с этим кодом в заголовках отправляет новый адрес —
 *    сервер шлёт ВТОРОЙ код на НОВЫЙ адрес.
 * 3. `confirmEmailChange` с challenge из ответа шага 2 и кодом из нового
 *    письма — только тут почта реально меняется.
 * Тело ответа шага 2 в OpenAPI не описано (`{type:"object"}`); challenge из
 * него достаём тем же терпимым разбором, что и для `/email-codes`
 * (см. `readEmailCodeChallenge`).
 *
 * Оба запроса — `confirmedRequest`, не `authorizedRequest`: 401 здесь может
 * значить неверный код (текущего или нового адреса), а не истёкшую сессию.
 */
export function startEmailChange(email: string, headers: HeadersInit) {
  return confirmedRequest<unknown>('/users/me/email', {
    method: 'POST',
    json: { email },
    headers,
  })
}

export function confirmEmailChange(challengeId: string, code: string) {
  return confirmedRequest<User>('/users/me/email/confirm', {
    method: 'POST',
    json: { challengeId, code },
  })
}

/**
 * Смена пароля (API 0.2.0). Завершает ВСЕ сессии — после 204 сессию нужно
 * очистить локально и увести на вход, второй HTTP-запрос это не подтвердит.
 * `confirmedRequest` — та же причина: 401 может значить неверный код или
 * неверный текущий пароль, а не истёкшую сессию.
 */
export function changePassword(
  input: { currentPassword: string; newPassword: string },
  headers: HeadersInit,
) {
  return confirmedRequest<void>('/users/me/password', {
    method: 'POST',
    json: input,
    headers,
  })
}
