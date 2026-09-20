import type {
  DayOff,
  DayOffList,
  Shift,
  ShiftList,
  ShiftStatus,
} from '@/types/shift'

/**
 * Разбор ответов смен и выходных — по образцу `bookings/parse.ts` и
 * `contracts/parse.ts`. Поля подтверждены фактическим ответом staging,
 * зафиксированным в `SHIFTS_API_EXAMPLES.md`.
 */

const KNOWN_SHIFT_STATUSES = new Set<ShiftStatus>(['open', 'closed', 'missed'])

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

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function readShiftStatus(value: unknown): ShiftStatus | null {
  const text = readString(value)

  return text && KNOWN_SHIFT_STATUSES.has(text as ShiftStatus)
    ? (text as ShiftStatus)
    : null
}

/**
 * `GET /shifts/current` без открытой смены отдаёт пустое тело — `apiRequest`
 * превращает его в `undefined`. Это единственная подтверждённая форма
 * «нет смены». Любое другое значение, которое не разбирается как смена
 * (`null`, строка, объект без корректного `id`), — нарушение контракта:
 * такой ответ не должен молча превращаться в «смены нет» и показывать
 * кнопку «Открыть смену», когда сервер на самом деле ответил чем-то
 * непонятным.
 */
export class CurrentShiftContractError extends Error {
  constructor() {
    super(
      'Сервер вернул текущую смену не в подтверждённой форме: не пустое тело и не объект смены с id.',
    )
    this.name = 'CurrentShiftContractError'
  }
}

export function readCurrentShift(payload: unknown): Shift | null {
  if (payload === undefined) {
    return null
  }

  const shift = readShift(payload)

  if (!shift) {
    throw new CurrentShiftContractError()
  }

  return shift
}

export function readShift(payload: unknown): Shift | null {
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
    date: readString(payload.date),
    openedAt: readString(payload.openedAt),
    closedAt: readString(payload.closedAt),
    status: readShiftStatus(payload.status),
    createdAt: readString(payload.createdAt),
    reportGenerated: readString(payload.reportGenerated),
  }
}

/**
 * В отличие от бронирований и договоров, здесь элемент без `id` не
 * пропускается молча: неполный список смен выглядел бы как достоверный, а
 * пользователь не может отличить «смен правда меньше» от «сервер прислал
 * мусор в середине списка». Один некорректный элемент — весь список
 * считается нарушением контракта.
 */
function collectShifts(values: unknown[]): Shift[] {
  return values.map((item) => {
    const shift = readShift(item)

    if (!shift) {
      throw new ShiftListContractError()
    }

    return shift
  })
}

export function readDayOff(payload: unknown): DayOff | null {
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
    date: readString(payload.date),
    approvedById: readString(payload.approvedById),
    reason: readString(payload.reason),
    createdAt: readString(payload.createdAt),
  }
}

/** Та же строгость, что и у `collectShifts` — см. комментарий там. */
function collectDayOffs(values: unknown[]): DayOff[] {
  return values.map((item) => {
    const dayOff = readDayOff(item)

    if (!dayOff) {
      throw new DayOffListContractError()
    }

    return dayOff
  })
}

/**
 * Единственная подтверждённая форма списка — `{ items, total, limit,
 * offset }`, та же, что у `/bookings` и `/contracts` (см.
 * `SHIFTS_API_EXAMPLES.md`). Нарушение этой формы — ошибка контракта, а не
 * пустой список: их нельзя путать, иначе сломанный ответ сервера выглядит
 * как «смен пока нет».
 */
export class ShiftListContractError extends Error {
  constructor() {
    super(
      'Сервер вернул список смен не в форме { items, total, limit, offset }.',
    )
    this.name = 'ShiftListContractError'
  }
}

export function readShiftList(
  payload: unknown,
  requested: { limit: number; offset: number },
): ShiftList {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new ShiftListContractError()
  }

  const items = collectShifts(payload.items)

  return {
    items,
    total: readNumber(payload.total) ?? items.length,
    limit: readNumber(payload.limit) ?? requested.limit,
    offset: readNumber(payload.offset) ?? requested.offset,
  }
}

export class DayOffListContractError extends Error {
  constructor() {
    super(
      'Сервер вернул список выходных не в форме { items, total, limit, offset }.',
    )
    this.name = 'DayOffListContractError'
  }
}

export function readDayOffList(
  payload: unknown,
  requested: { limit: number; offset: number },
): DayOffList {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new DayOffListContractError()
  }

  const items = collectDayOffs(payload.items)

  return {
    items,
    total: readNumber(payload.total) ?? items.length,
    limit: readNumber(payload.limit) ?? requested.limit,
    offset: readNumber(payload.offset) ?? requested.offset,
  }
}
