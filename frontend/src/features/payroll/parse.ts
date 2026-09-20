import type { PayrollEntry, PayrollSettings } from '@/types/payroll'

/**
 * Разбор ответов зарплаты. В отличие от `bookings`/`contracts`/`shifts`,
 * `payroll` подтверждён живьём как «голый» объект/массив, БЕЗ конверта
 * `{ items, total, limit, offset }` — см. `PAYROLL_API_EXAMPLES.md`. Не
 * копировать сюда конверт по аналогии с другими модулями.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() === '' ? null : value
  }

  return null
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/**
 * `GET /payroll/settings` до первой настройки отдаёт пустое тело — тот же
 * подтверждённый паттерн, что и у `GET /shifts/current`: пустое тело значит
 * «настроек ещё нет», не ошибка. Любая другая форма, из которой нельзя
 * собрать оба обязательных поля `PayrollSettingsDto`, — нарушение контракта:
 * так сломанный ответ сервера не выглядит как «настроек ещё нет».
 */
export class PayrollSettingsContractError extends Error {
  constructor() {
    super(
      'Сервер вернул настройки зарплаты не в подтверждённой форме: не пустое тело и не объект с finePerMissedShiftTyiyn/taxRatePercent.',
    )
    this.name = 'PayrollSettingsContractError'
  }
}

export function readPayrollSettings(payload: unknown): PayrollSettings | null {
  if (payload === undefined) {
    return null
  }

  if (!isRecord(payload)) {
    throw new PayrollSettingsContractError()
  }

  const finePerMissedShiftTyiyn = readString(payload.finePerMissedShiftTyiyn)
  const taxRatePercent = readString(payload.taxRatePercent)
  const updatedAt = readString(payload.updatedAt)

  if (!finePerMissedShiftTyiyn || !taxRatePercent || !updatedAt) {
    throw new PayrollSettingsContractError()
  }

  return { finePerMissedShiftTyiyn, taxRatePercent, updatedAt }
}

export function readPayrollEntry(payload: unknown): PayrollEntry | null {
  if (!isRecord(payload)) {
    return null
  }

  const id = readString(payload.id)

  if (!id) {
    return null
  }

  return {
    id,
    userId: readString(payload.userId),
    employeeFullName: readString(payload.employeeFullName),
    employeeRole: readString(payload.employeeRole),
    period: readString(payload.period),
    baseSalaryTyiyn: readString(payload.baseSalaryTyiyn),
    missedShiftsCount: readNumber(payload.missedShiftsCount),
    finePerMissedShiftTyiyn: readString(payload.finePerMissedShiftTyiyn),
    fineAmountTyiyn: readString(payload.fineAmountTyiyn),
    fineManuallyAdjusted: readBoolean(payload.fineManuallyAdjusted),
    taxRatePercent: readString(payload.taxRatePercent),
    taxAmountTyiyn: readString(payload.taxAmountTyiyn),
    finalAmountTyiyn: readString(payload.finalAmountTyiyn),
    status: readString(payload.status),
    confirmedById: readString(payload.confirmedById),
    confirmedAt: readString(payload.confirmedAt),
  }
}

/**
 * Подтверждённая живьём форма и `GET /payroll/entries`, и
 * `POST /payroll/entries/generate` — голый массив. Как и в `shifts/parse.ts`,
 * один некорректный элемент делает весь список недостоверным: не пропускаем
 * его молча через `flatMap`, иначе часть начислений исчезла бы без следа.
 */
export class PayrollEntryListContractError extends Error {
  constructor() {
    super('Сервер вернул список начислений не в форме массива объектов.')
    this.name = 'PayrollEntryListContractError'
  }
}

export function readPayrollEntryList(payload: unknown): PayrollEntry[] {
  if (!Array.isArray(payload)) {
    throw new PayrollEntryListContractError()
  }

  return payload.map((item) => {
    const entry = readPayrollEntry(item)

    if (!entry) {
      throw new PayrollEntryListContractError()
    }

    return entry
  })
}

/**
 * `GET /payroll/entries/{id}` — голый объект. Отсутствие записи — это 404
 * от `authorizedRequest` (см. `errors.ts`), а не пустое тело, поэтому здесь
 * нет варианта «не найдено» на уровне разбора.
 */
export class PayrollEntryContractError extends Error {
  constructor() {
    super('Сервер вернул начисление не в подтверждённой форме объекта с id.')
    this.name = 'PayrollEntryContractError'
  }
}

export function readPayrollEntryOrThrow(payload: unknown): PayrollEntry {
  const entry = readPayrollEntry(payload)

  if (!entry) {
    throw new PayrollEntryContractError()
  }

  return entry
}
