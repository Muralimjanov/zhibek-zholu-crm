/**
 * Типы подтверждены по `GET /auth/me` в опубликованной OpenAPI-схеме API
 * 0.2.0 (`https://uzz-crm-api.onrender.com/api/v1/docs-json`) и по
 * `CLAUDE_API_V02_MIGRATION.md`. Схема не публикует перечисления `role` и
 * `status`, поэтому неизвестные значения не ломают типизацию.
 */

export type KnownUserRole =
  | 'director'
  | 'head_of_sales'
  | 'sales_manager'
  | 'accountant'
  | 'investor'
  /** Ресепшен: регистрирует обращения, больше в CRM ничего не видит (API 0.4.0). */
  | 'reception'

export type UserRole = KnownUserRole | (string & Record<never, never>)

/** Перечисление статусов в OpenAPI не описано. Известное значение: `active`. */
export type UserStatus = string

export interface User {
  id: string
  username: string
  fullName: string
  phone: string | null
  email: string | null
  avatarUrl: string | null
  /**
   * `UserResponseDto.emailVerified` (0.2.0): true, если на этот адрес хотя бы
   * раз пришёл код (вход или смена почты).
   */
  emailVerified: boolean
  role: UserRole
  status: UserStatus
  teamLeadId: string | null
  createdAt: string
}

export interface LoginRequest {
  username: string
  password: string
}

/**
 * Первый шаг входа (`POST /auth/login`, API 0.2.0). Тело ответа в OpenAPI
 * объявлено как пустой `object`, но описание операции дословно называет
 * поля: "Returns { mfaRequired: true, challengeId, expiresAt, emailHint }
 * and emails a code; no session yet." Токена и сессии здесь ещё нет.
 */
export interface LoginChallenge {
  mfaRequired: true
  challengeId: string
  expiresAt: string | null
  /** Например, замаскированный адрес — сервер решает формат. */
  emailHint: string | null
}

export interface LoginVerifyRequest {
  challengeId: string
  code: string
}

/**
 * Ответ `POST /auth/login/verify` в OpenAPI тоже объявлен как пустой
 * `object` — конкретные имена полей схемой не подтверждены. Ниже — форма по
 * аналогии с уже подтверждённым `POST /auth/refresh` (`accessToken`,
 * `csrfToken`, `user`), а не факт из схемы: сверить вживую при первой
 * возможности (см. `src/features/auth/loginFlow.ts`).
 */
export interface LoginVerifyResponse {
  accessToken: string
  expiresIn?: number
  csrfToken: string
  user: User
}

/** Тело ответа refresh в OpenAPI не описано; поля взяты из `API_TESTING.md`. */
export interface RefreshResponse {
  accessToken: string
  csrfToken: string
  expiresIn?: number
}

export interface LogoutResponse {
  success: boolean
}
