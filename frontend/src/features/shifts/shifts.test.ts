import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assignableDayOffRoles,
  canCreateDayOff,
  canHaveOwnShift,
  canViewShiftsSection,
  canViewTeamShifts,
} from './access.ts'
import { DATE_ONLY_PATTERN, todayInBishkek } from './date.ts'
import { formatBishkekDateTime, formatDateOnly } from './labels.ts'
import {
  CurrentShiftContractError,
  DayOffListContractError,
  readCurrentShift,
  readDayOff,
  readDayOffList,
  readShift,
  readShiftList,
  ShiftListContractError,
} from './parse.ts'

// Запуск: npm test (Node 22 исполняет TypeScript напрямую, зависимостей нет).

test('разбор смены: фактический ответ POST /shifts/open', () => {
  const shift = readShift({
    id: 's1',
    userId: 'u1',
    date: '2026-09-17',
    openedAt: '2026-09-17T16:43:30.780Z',
    closedAt: null,
    status: 'open',
    createdAt: '2026-09-17T16:43:30.780Z',
  })

  assert.equal(shift?.status, 'open')
  assert.equal(shift?.closedAt, null)
  assert.equal(shift?.reportGenerated, null)
})

test('разбор смены: закрытие с ежедневным отчётом', () => {
  const shift = readShift({
    id: 's1',
    userId: 'u1',
    date: '2026-09-17',
    openedAt: '2026-09-17T16:43:30.780Z',
    closedAt: '2026-09-17T16:44:25.410Z',
    status: 'closed',
    createdAt: '2026-09-17T16:43:30.780Z',
    reportGenerated: 'financial',
  })

  assert.equal(shift?.status, 'closed')
  assert.equal(shift?.reportGenerated, 'financial')
})

test('разбор смены: без id это не смена', () => {
  assert.equal(readShift({ status: 'open' }), null)
  assert.equal(readShift(null), null)
})

test('текущая смена: пустое тело (нет смены) — это null, не ошибка', () => {
  assert.equal(readCurrentShift(undefined), null)
})

test('текущая смена: непустое тело разбирается как обычная смена', () => {
  const shift = readCurrentShift({ id: 's1', status: 'open' })

  assert.equal(shift?.id, 's1')
})

test('текущая смена: только undefined — подтверждённое «нет смены», всё остальное непонятное — ошибка формата', () => {
  for (const malformed of [null, 'строка', {}, { status: 'open' }, []]) {
    assert.throws(
      () => readCurrentShift(malformed),
      CurrentShiftContractError,
      JSON.stringify(malformed),
    )
  }

  // undefined — единственное подтверждённое «нет смены», не ошибка.
  assert.equal(readCurrentShift(undefined), null)
})

test('разбор выходного: фактический ответ POST /day-offs', () => {
  const dayOff = readDayOff({
    id: 'd1',
    userId: 'u1',
    date: '2026-09-20',
    approvedById: 'director-1',
    reason: 'тестовый выходной',
    createdAt: '2026-09-17T16:46:42.271Z',
  })

  assert.equal(dayOff?.date, '2026-09-20')
  assert.equal(dayOff?.approvedById, 'director-1')
})

test('разбор списка смен: форма { items, total, limit, offset }', () => {
  const list = readShiftList(
    { items: [{ id: 's1', status: 'closed' }], total: 1, limit: 50, offset: 0 },
    { limit: 50, offset: 0 },
  )

  assert.equal(list.total, 1)
  assert.equal(list.items[0].status, 'closed')
})

test('разбор списка смен: настоящий пустой список — это items: []', () => {
  const list = readShiftList(
    { items: [], total: 0, limit: 50, offset: 0 },
    { limit: 50, offset: 0 },
  )

  assert.deepEqual(list, { items: [], total: 0, limit: 50, offset: 0 })
})

test('разбор списка смен: нарушение контракта — это ошибка, а не пустой список', () => {
  for (const malformed of [null, undefined, 'строка', [{ id: 's1' }], {}]) {
    assert.throws(
      () => readShiftList(malformed, { limit: 50, offset: 0 }),
      ShiftListContractError,
      JSON.stringify(malformed),
    )
  }
})

test('разбор списка смен: один некорректный элемент внутри списка — весь список не показываем как достоверный', () => {
  assert.throws(
    () =>
      readShiftList(
        {
          items: [{ id: 's1', status: 'open' }, { status: 'closed' }],
          total: 2,
          limit: 50,
          offset: 0,
        },
        { limit: 50, offset: 0 },
      ),
    ShiftListContractError,
  )
})

test('разбор списка выходных: та же строгость к конверту', () => {
  const list = readDayOffList(
    { items: [{ id: 'd1' }], total: 1, limit: 50, offset: 0 },
    { limit: 50, offset: 0 },
  )

  assert.equal(list.items.length, 1)

  assert.throws(
    () => readDayOffList([], { limit: 50, offset: 0 }),
    DayOffListContractError,
  )

  assert.throws(
    () =>
      readDayOffList(
        {
          items: [{ id: 'd1' }, { reason: 'без id' }],
          total: 2,
          limit: 50,
          offset: 0,
        },
        { limit: 50, offset: 0 },
      ),
    DayOffListContractError,
    'один некорректный элемент — весь список не показываем как достоверный',
  )
})

test('правила доступа: собственная смена только у менеджера, начальника продаж и бухгалтера', () => {
  assert.equal(canHaveOwnShift('sales_manager'), true)
  assert.equal(canHaveOwnShift('head_of_sales'), true)
  assert.equal(canHaveOwnShift('accountant'), true)
  assert.equal(canHaveOwnShift('director'), false)
  assert.equal(canHaveOwnShift('investor'), false)
})

test('правила доступа: раздел смен виден директору (без своей смены) и инвестору не виден', () => {
  assert.equal(canViewShiftsSection('director'), true)
  assert.equal(canViewShiftsSection('investor'), false)
})

test('правила доступа: команду видят директор и начальник продаж', () => {
  assert.equal(canViewTeamShifts('director'), true)
  assert.equal(canViewTeamShifts('head_of_sales'), true)
  assert.equal(canViewTeamShifts('sales_manager'), false)
  assert.equal(canViewTeamShifts('accountant'), false)
})

test('правила доступа: выходной согласуют директор и начальник продаж, менеджер — нет', () => {
  assert.equal(canCreateDayOff('director'), true)
  assert.equal(canCreateDayOff('head_of_sales'), true)
  assert.equal(canCreateDayOff('sales_manager'), false)
  assert.equal(canCreateDayOff('accountant'), false)
})

test('правила доступа: директор согласует начальнику продаж и бухгалтеру, начальник продаж — менеджерам', () => {
  assert.deepEqual(assignableDayOffRoles('director'), [
    'head_of_sales',
    'accountant',
  ])
  assert.deepEqual(assignableDayOffRoles('head_of_sales'), ['sales_manager'])
  assert.deepEqual(assignableDayOffRoles('sales_manager'), [])
})

test('дата Бишкека: формат YYYY-MM-DD', () => {
  assert.match(todayInBishkek(), DATE_ONLY_PATTERN)
})

test('formatBishkekDateTime: явно переводит UTC в часовой пояс Бишкека (UTC+6)', () => {
  // 16:43 UTC + 6 часов = 22:43 в Бишкеке — не зависит от часового пояса машины, где идёт тест.
  const formatted = formatBishkekDateTime('2026-09-17T16:43:30.780Z')

  assert.match(formatted, /17\.09\.2026/)
  assert.match(formatted, /22:43/)
})

test('formatBishkekDateTime: пусто и мусор не превращаются в дату', () => {
  assert.equal(formatBishkekDateTime(null), '—')
  assert.equal(formatBishkekDateTime('не дата'), 'не дата')
})

test('formatDateOnly: YYYY-MM-DD остаётся как есть, без сдвига часового пояса', () => {
  assert.equal(formatDateOnly('2026-09-17'), '17.09.2026')
  assert.equal(formatDateOnly(null), '—')
})
