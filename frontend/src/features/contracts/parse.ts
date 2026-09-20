import type { Contract, ContractList, ContractStatus } from '@/types/contract'

/**
 * ЕДИНСТВЕННОЕ место, где разбирается ответ договоров.
 *
 * Тела `GET /contracts` и `GET /contracts/{id}` в OpenAPI не описаны. Поля
 * ниже сверены с фактическим ответом staging под `demo_director`,
 * зафиксированным в `CONTRACTS_API_EXAMPLES.md`: `id`, `status`, `areaSqm`,
 * `pricePerSqmTyiyn`, `totalAmountTyiyn`, `depositPercent`,
 * `depositAmountTyiyn`, `depositPaid`, `depositPaidAt`, `hasFile`,
 * `managerId`, `bookingId`, `createdAt`, `updatedAt`, `fullName`,
 * `passportNumber`, `address`, `phone`, `email`, `buyerConsentVersion`,
 * `buyerConsentConfirmedAt`. Бухгалтерское представление по описанию
 * операции в OpenAPI не содержит полей покупателя — их отсутствие в ответе
 * не считается нарушением контракта, а просто становится `null`.
 */

const KNOWN_STATUSES = new Set<ContractStatus>([
  'draft',
  'deposit_paid',
  'signed',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() === '' ? null : value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return null
}

function readStatus(value: unknown): ContractStatus | null {
  const text = readString(value)

  return text && KNOWN_STATUSES.has(text as ContractStatus)
    ? (text as ContractStatus)
    : null
}

function readBoolean(value: unknown): boolean {
  return value === true
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function readContract(payload: unknown): Contract | null {
  if (!isRecord(payload)) {
    return null
  }

  const id = readString(payload.id)

  if (!id) {
    return null
  }

  return {
    id,
    status: readStatus(payload.status),
    areaSqm: readString(payload.areaSqm),
    pricePerSqmTyiyn: readString(payload.pricePerSqmTyiyn),
    totalAmountTyiyn: readString(payload.totalAmountTyiyn),
    depositPercent: readString(payload.depositPercent),
    depositAmountTyiyn: readString(payload.depositAmountTyiyn),
    depositPaid: readBoolean(payload.depositPaid),
    depositPaidAt: readString(payload.depositPaidAt),
    hasFile: readBoolean(payload.hasFile),
    managerId: readString(payload.managerId),
    bookingId: readString(payload.bookingId),
    createdAt: readString(payload.createdAt),
    updatedAt: readString(payload.updatedAt),
    fullName: readString(payload.fullName),
    passportNumber: readString(payload.passportNumber),
    address: readString(payload.address),
    phone: readString(payload.phone),
    email: readString(payload.email),
    buyerConsentVersion: readString(payload.buyerConsentVersion),
    buyerConsentConfirmedAt: readString(payload.buyerConsentConfirmedAt),
  }
}

function collect(values: unknown[]): Contract[] {
  return values.flatMap((item) => {
    const contract = readContract(item)

    return contract ? [contract] : []
  })
}

/** Совпадает с `bookings/parse.ts`: единственная форма ответа — { items, total, limit, offset }. */
export class ContractListContractError extends Error {
  constructor() {
    // Без содержимого ответа: в нём могут быть персональные данные покупателя.
    super(
      'Сервер вернул список договоров не в форме { items, total, limit, offset }.',
    )
    this.name = 'ContractListContractError'
  }
}

/**
 * По `CONTRACTS_API_EXAMPLES.md` список — это ровно `{ items, total, limit,
 * offset }`. Мусор внутри `items` переживаем поэлементно, но сам конверт
 * ответа не той формы — нарушение контракта, а не «договоров пока нет».
 */
export function readContractList(
  payload: unknown,
  requested: { limit: number; offset: number },
): ContractList {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new ContractListContractError()
  }

  const items = collect(payload.items)

  return {
    items,
    total: readNumber(payload.total) ?? items.length,
    limit: readNumber(payload.limit) ?? requested.limit,
    offset: readNumber(payload.offset) ?? requested.offset,
  }
}
