import type { Booking, BookingList } from '@/types/booking'

/**
 * ЕДИНСТВЕННОЕ место, где разбирается ответ бронирований.
 *
 * Тела `GET /bookings` и `GET /bookings/{id}` в опубликованной OpenAPI-схеме
 * не описаны (там только `type: object`). Поля ниже сверены с фактическим
 * ответом staging под `demo_director`, зафиксированным в
 * `BOOKINGS_API_EXAMPLES.md`: `id`, `fullName`, `passportNumber`, `phone`,
 * `email`, `desiredAreaSqm`, `status`, `managerId`, `contractId`,
 * `buyerConsentVersion`, `buyerConsentConfirmedAt`, `createdAt`, `updatedAt`.
 * Менеджер приходит только как `managerId` (плоское поле) — вложенного
 * объекта `manager` и отдельного `managerName` сервер не отдаёт, поэтому
 * их разбор здесь убран, а не угадан заново.
 *
 * Разбор остаётся защитным (отсутствующее или неожиданно неверного типа
 * поле становится `null`, а не ломает страницу), но имена полей больше не
 * гипотеза.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() === '' ? null : value
  }

  // Площадь по контракту строковая, но число тоже переживём без потерь.
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return null
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

export function readBooking(payload: unknown): Booking | null {
  if (!isRecord(payload)) {
    return null
  }

  const id = readString(payload.id)

  if (!id) {
    return null
  }

  return {
    id,
    fullName: readString(payload.fullName),
    passportNumber: readString(payload.passportNumber),
    phone: readString(payload.phone),
    email: readString(payload.email),
    desiredAreaSqm: readString(payload.desiredAreaSqm),
    status: readString(payload.status),
    managerId: readString(payload.managerId),
    contractId: readString(payload.contractId),
    buyerConsentVersion: readString(payload.buyerConsentVersion),
    buyerConsentConfirmedAt: readString(payload.buyerConsentConfirmedAt),
    createdAt: readString(payload.createdAt),
    updatedAt: readString(payload.updatedAt),
  }
}

function collect(values: unknown[]): Booking[] {
  return values.flatMap((item) => {
    const booking = readBooking(item)

    return booking ? [booking] : []
  })
}

/**
 * Подтверждённый контракт `GET /bookings` — единственная форма, которую
 * считаем настоящим списком.
 */
export class BookingListContractError extends Error {
  constructor() {
    // Без содержимого ответа: в нём могут быть персональные данные покупателя.
    super(
      'Сервер вернул список бронирований не в форме { items, total, limit, offset }.',
    )
    this.name = 'BookingListContractError'
  }
}

/**
 * По `BOOKINGS_API_EXAMPLES.md` список — это ровно `{ items, total, limit,
 * offset }`, где `items` — массив (пустой при отсутствии броней). Ответ не
 * такой формы — нарушение контракта, а не «броней пока нет»: их нельзя
 * путать, иначе сломанный ответ сервера выглядит как пустой список.
 * Мусор внутри `items` по-прежнему переживаем поэлементно — это отдельный
 * случай от формы самого конверта.
 */
export function readBookingList(
  payload: unknown,
  requested: { limit: number; offset: number },
): BookingList {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new BookingListContractError()
  }

  const items = collect(payload.items)

  return {
    items,
    total: readNumber(payload.total) ?? items.length,
    limit: readNumber(payload.limit) ?? requested.limit,
    offset: readNumber(payload.offset) ?? requested.offset,
  }
}
