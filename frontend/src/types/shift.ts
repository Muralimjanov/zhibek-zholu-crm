/**
 * Типы смен и выходных.
 *
 * Тела ответов `GET /shifts/current`, `GET /shifts`, `GET /day-offs` в
 * OpenAPI не описаны. Форма подтверждена фактическими ответами staging под
 * тестовым сотрудником и директором, зафиксированными в
 * `SHIFTS_API_EXAMPLES.md`. Разбор — в `src/features/shifts/parse.ts`.
 */

/** Статусы из `CorrectShiftDto` в OpenAPI; фактически встречались `open`/`closed`. */
export type ShiftStatus = 'open' | 'closed' | 'missed'

export interface Shift {
  id: string
  userId: string | null
  /** `YYYY-MM-DD`, календарный день Бишкека. */
  date: string | null
  openedAt: string | null
  closedAt: string | null
  status: ShiftStatus | null
  createdAt: string | null
  /**
   * Только в ответе `POST /shifts/close`, если сервер создал ежедневный
   * отчёт. Подтверждено значение `"financial"` (бухгалтер); `"sales"`
   * (начальник продаж) — только по тексту описания операции, не проверено
   * отдельным вызовом.
   */
  reportGenerated: string | null
}

export interface ShiftList {
  items: Shift[]
  total: number
  limit: number
  offset: number
}

export interface ShiftListQuery {
  status?: ShiftStatus
  from?: string
  to?: string
  userId?: string
  limit: number
  offset: number
}

export interface DayOff {
  id: string
  userId: string | null
  date: string | null
  approvedById: string | null
  reason: string | null
  createdAt: string | null
}

export interface DayOffList {
  items: DayOff[]
  total: number
  limit: number
  offset: number
}

export interface DayOffListQuery {
  from?: string
  to?: string
  userId?: string
  limit: number
  offset: number
}

export interface CreateDayOffRequest {
  userId: string
  /** `YYYY-MM-DD`. Дата в прошлом → 400 `DAY_OFF_DATE_IN_PAST`. */
  date: string
  reason?: string
}
