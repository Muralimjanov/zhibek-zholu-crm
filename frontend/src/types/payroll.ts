/**
 * Типы зарплаты. OpenAPI 0.2.0 объявляет тела ответов `payroll/*` как
 * непубликуемый `object`/массив `object` без описанных полей. Форма ниже
 * подтверждена фактическими ответами тестового бухгалтера и директора,
 * зафиксированными в `PAYROLL_API_EXAMPLES.md`. Разбор — в
 * `src/features/payroll/parse.ts`, который не доверяет этим типам вслепую:
 * любое поле, которого нет в ответе, не выдумывается.
 */

/** Фактически встречались только `draft` и `confirmed`. */
export type PayrollEntryStatus = 'draft' | 'confirmed'

/**
 * Настройки налога и штрафа. `GET /payroll/settings` до первой настройки
 * отдаёт пустое тело — на клиенте это `null`, не ошибка (см. `parse.ts`).
 */
export interface PayrollSettings {
  /** Тыйын, строка. */
  finePerMissedShiftTyiyn: string
  /** Процент строкой, сервер нормализует до двух знаков ("10" → "10.00"). */
  taxRatePercent: string
  updatedAt: string
}

export interface UpdatePayrollSettingsRequest {
  finePerMissedShiftTyiyn: string
  taxRatePercent: string
}

export interface PayrollEntry {
  id: string
  userId: string | null
  employeeFullName: string | null
  employeeRole: string | null
  /** `YYYY-MM`. */
  period: string | null
  baseSalaryTyiyn: string | null
  missedShiftsCount: number | null
  finePerMissedShiftTyiyn: string | null
  fineAmountTyiyn: string | null
  fineManuallyAdjusted: boolean | null
  taxRatePercent: string | null
  taxAmountTyiyn: string | null
  finalAmountTyiyn: string | null
  /**
   * Неизвестное значение статуса (не `draft`/`confirmed`) сохраняется как
   * есть, но `isPayrollEntryEditable` для него возвращает `false` —
   * безопасное значение по умолчанию, а не предположение, что править можно.
   */
  status: PayrollEntryStatus | (string & Record<never, never>) | null
  confirmedById: string | null
  confirmedAt: string | null
}

export interface PayrollEntryListQuery {
  period?: string
  status?: PayrollEntryStatus
}

export interface GeneratePayrollEntriesRequest {
  /** `YYYY-MM`. */
  period: string
}

/**
 * Ручная коррекция черновика. Подтверждено: сервер отвечает `409
 * PAYROLL_ENTRY_CONFIRMED`, если запись уже подтверждена — отправлять запрос
 * можно только для `status: "draft"`. Никаких других полей DTO не описывает.
 */
export interface CorrectPayrollEntryRequest {
  baseSalaryTyiyn?: string
  fineAmountTyiyn?: string
}
