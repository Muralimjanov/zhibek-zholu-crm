import { authorizedRequest } from '@/features/auth/session'
import { getAccessToken } from '@/features/auth/session-store'
import { apiRequest } from '@/lib/api/client'
import type { User } from '@/types/auth'
import type { CreateUserAccepted, CreateUserRequest } from '@/types/users'

export function fetchUsers() {
  return authorizedRequest<User[]>('/users')
}

/** 202: это только запрос на создание, аккаунта ещё нет. */
export function requestUserCreation(input: CreateUserRequest) {
  return authorizedRequest<CreateUserAccepted>('/confirmations/users', {
    method: 'POST',
    json: input,
  })
}

export function fetchPendingActions() {
  return authorizedRequest<unknown>('/confirmations/pending')
}

/**
 * 201 с созданным пользователем — только здесь аккаунт появляется.
 *
 * Внимание: на этом маршруте **401 означает неверный код**, а не истёкшую
 * сессию. Поэтому общий `authorizedRequest` здесь не подходит: он принял бы
 * 401 за просроченный токен, сделал refresh, повторил запрос с тем же
 * неверным кодом и по второму 401 выбросил бы директора из системы.
 *
 * Вместо этого сначала дёргаем дешёвый защищённый запрос — он при
 * необходимости обновит токен штатным механизмом, — а код отправляем уже
 * напрямую, зная, что токен свежий.
 */
export async function confirmAction(id: string, code: string): Promise<User> {
  await authorizedRequest<User>('/auth/me')

  return apiRequest<User>(`/confirmations/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
    json: { code },
    token: getAccessToken(),
  })
}

export function rejectAction(id: string) {
  return authorizedRequest<unknown>(
    `/confirmations/${encodeURIComponent(id)}/reject`,
    { method: 'POST' },
  )
}
