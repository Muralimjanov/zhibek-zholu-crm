import type {
  AccountingSummary,
  AccountingSummaryCategory,
  Transaction,
} from '@/types/finance'

/**
 * Разбор ответов бухгалтерии. Подтверждённая живьём форма списка —
 * конверт `{ items, total, limit, offset }` (как у `bookings`/`contracts`/
 * `shifts`, НЕ голый массив, как у `payroll`) — см. `FINANCE_API_EXAMPLES.md`.
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

export function readTransaction(payload: unknown): Transaction | null {
  if (!isRecord(payload)) {
    return null
  }

  const id = readString(payload.id)

  if (!id) {
    return null
  }

  return {
    id,
    type: readString(payload.type) as Transaction['type'],
    category: readString(payload.category) as Transaction['category'],
    subcategory: readString(payload.subcategory),
    amountTyiyn: readString(payload.amountTyiyn),
    currency: readString(payload.currency),
    date: readString(payload.date),
    comment: readString(payload.comment),
    // `null`, если поле отсутствует или не булево — неизвестное состояние
    // не должно молча становиться «файла нет»/«месяц открыт» (см.
    // `access.ts#isTransactionEditable` и `labels.ts`): раньше здесь была
    // подстановка `false`, которая как раз это и делала.
    hasAttachment: readBoolean(payload.hasAttachment),
    relatedContractId: readString(payload.relatedContractId),
    createdById: readString(payload.createdById),
    periodClosed: readBoolean(payload.periodClosed),
    createdAt: readString(payload.createdAt),
    updatedAt: readString(payload.updatedAt),
  }
}

/**
 * Один некорректный элемент делает весь список недостоверным — та же
 * строгость, что в `shifts/parse.ts`/`payroll/parse.ts`: список операций не
 * должен молча терять записи.
 */
export class TransactionListContractError extends Error {
  constructor() {
    super(
      'Сервер вернул список операций не в форме { items, total, limit, offset }.',
    )
    this.name = 'TransactionListContractError'
  }
}

function collectTransactions(values: unknown[]): Transaction[] {
  return values.map((item) => {
    const transaction = readTransaction(item)

    if (!transaction) {
      throw new TransactionListContractError()
    }

    return transaction
  })
}

export function readTransactionList(
  payload: unknown,
  requested: { limit: number; offset: number },
): { items: Transaction[]; total: number; limit: number; offset: number } {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new TransactionListContractError()
  }

  const items = collectTransactions(payload.items)

  return {
    items,
    total: readNumber(payload.total) ?? items.length,
    limit: readNumber(payload.limit) ?? requested.limit,
    offset: readNumber(payload.offset) ?? requested.offset,
  }
}

export class TransactionContractError extends Error {
  constructor() {
    super('Сервер вернул операцию не в подтверждённой форме объекта с id.')
    this.name = 'TransactionContractError'
  }
}

export function readTransactionOrThrow(payload: unknown): Transaction {
  const transaction = readTransaction(payload)

  if (!transaction) {
    throw new TransactionContractError()
  }

  return transaction
}

function readSummaryCategory(
  payload: unknown,
): AccountingSummaryCategory | null {
  if (!isRecord(payload)) {
    return null
  }

  return {
    category: readString(
      payload.category,
    ) as AccountingSummaryCategory['category'],
    label: readString(payload.label),
    type: readString(payload.type) as AccountingSummaryCategory['type'],
    count: readNumber(payload.count),
    amountTyiyn: readString(payload.amountTyiyn),
  }
}

/**
 * `GET /accounting/summary` всегда получает обязательные `from`/`to` и
 * подтверждён живьём как объект с `byCategory` — в отличие от `payroll
 * settings`, у него нет варианта «пустое тело — ещё не настроено».
 */
export class AccountingSummaryContractError extends Error {
  constructor() {
    super(
      'Сервер вернул сводку не в подтверждённой форме объекта с byCategory.',
    )
    this.name = 'AccountingSummaryContractError'
  }
}

export function readAccountingSummary(payload: unknown): AccountingSummary {
  if (!isRecord(payload) || !Array.isArray(payload.byCategory)) {
    throw new AccountingSummaryContractError()
  }

  const byCategory = payload.byCategory.map((item) => {
    const category = readSummaryCategory(item)

    if (!category) {
      throw new AccountingSummaryContractError()
    }

    return category
  })

  return {
    from: readString(payload.from),
    to: readString(payload.to),
    incomeTyiyn: readString(payload.incomeTyiyn),
    expenseTyiyn: readString(payload.expenseTyiyn),
    netTyiyn: readString(payload.netTyiyn),
    byCategory,
  }
}
