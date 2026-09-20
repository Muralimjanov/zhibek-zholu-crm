import type { KnownUserRole } from './auth'

/**
 * Тело `POST /confirmations/users` (`CreateUserDto`, API 0.2.0). С этой
 * версии `email` обязателен — описание поля в OpenAPI дословно: "Required:
 * login codes are sent here, so it must be a real, working mailbox."
 * (рабочий адрес нужен для кода входа самого нового сотрудника).
 */
export interface CreateUserRequest {
  username: string
  password: string
  fullName: string
  phone?: string
  email: string
  role: KnownUserRole
}

/**
 * 202-ответ на запрос создания. В OpenAPI объявлен как общий `object`,
 * поэтому разбираем его терпимо, не навязывая имена полей.
 */
export type CreateUserAccepted = Record<string, unknown>

/**
 * Элемент `GET /confirmations/pending`.
 *
 * `PendingActionSummaryDto` в OpenAPI объявлен без свойств, поэтому поля взяты
 * из фактического ответа staging от 17.09.2026:
 * `id`, `type`, `status`, `expiresAt`, `createdAt`, `initiatorUserId`,
 * `summary`. Отдельных `username`, `fullName` и `role` в ответе нет —
 * человекочитаемое описание лежит в `summary`.
 */
export interface PendingAction {
  id: string
  type: string | null
  status: string | null
  summary: string | null
  createdAt: string | null
  expiresAt: string | null
  initiatorUserId: string | null
}

/** Единственный тип запроса, который поддерживает этот раздел. */
export const CREATE_USER_ACTION_TYPE = 'create_user'
