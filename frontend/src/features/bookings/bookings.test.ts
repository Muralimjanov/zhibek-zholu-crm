import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assignableManagerRoles,
  isActiveStaff,
  managerRequiredOnCreate,
  managerSelectableOnCreate,
} from './access.ts'
import { formatArea, normalizeAreaInput } from './area.ts'
import {
  BookingListContractError,
  readBooking,
  readBookingList,
} from './parse.ts'

// Запуск: npm test (Node 22 исполняет TypeScript напрямую, зависимостей нет).

test('площадь: допустимые значения приводятся к формату API', () => {
  assert.equal(normalizeAreaInput('60'), '60')
  assert.equal(normalizeAreaInput('45.5'), '45.5')
  assert.equal(normalizeAreaInput('45,5'), '45.5', 'запятая как разделитель')
  assert.equal(normalizeAreaInput(' 60 '), '60', 'пробелы по краям')
  assert.equal(normalizeAreaInput('45.50'), '45.5', 'незначащий ноль убран')
  assert.equal(normalizeAreaInput('060'), '60', 'ведущий ноль убран')
  assert.equal(normalizeAreaInput('0.25'), '0.25')
})

test('площадь: недопустимые значения отбрасываются', () => {
  for (const value of ['', '  ', 'abc', '-5', '45.555', '1e3', '12.', '.5']) {
    assert.equal(normalizeAreaInput(value), null, value)
  }
})

test('площадь: показывается с русским разделителем', () => {
  assert.equal(formatArea('45.5'), '45,5 м²')
  assert.equal(formatArea('60'), '60 м²')
  assert.equal(formatArea(null), '—')
})

test('разбор списка: форма { items, total, limit, offset }', () => {
  const list = readBookingList(
    {
      items: [
        {
          id: 'b1',
          fullName: 'Заглушка Заглушкина',
          passportNumber: '*****4567',
          phone: '+996 555 00-00-00',
          email: null,
          desiredAreaSqm: '60',
          status: 'active',
          managerId: 'm1',
        },
      ],
      total: 37,
      limit: 20,
      offset: 20,
    },
    { limit: 20, offset: 20 },
  )

  assert.equal(list.total, 37)
  assert.equal(list.limit, 20)
  assert.equal(list.offset, 20)
  assert.equal(list.items.length, 1)
  assert.equal(list.items[0].passportNumber, '*****4567')
  assert.equal(list.items[0].email, null)
})

test('разбор списка: настоящий пустой список — это items: []', () => {
  const list = readBookingList(
    { items: [], total: 0, limit: 20, offset: 0 },
    { limit: 20, offset: 0 },
  )

  assert.deepEqual(list, { items: [], total: 0, limit: 20, offset: 0 })
})

test('разбор списка: элементы без id пропускаются, но конверт остаётся', () => {
  assert.equal(
    readBookingList(
      { items: [{ id: 'b1' }, {}, 'мусор'] },
      { limit: 20, offset: 0 },
    ).items.length,
    1,
  )
})

test('разбор списка: нарушение контракта — это ошибка, а не пустой список', () => {
  // Не форма { items, total, limit, offset }: голый массив, null, объект без items.
  for (const malformed of [
    null,
    undefined,
    'строка',
    [{ id: 'b1' }],
    {},
    { items: 'не массив' },
  ]) {
    assert.throws(
      () => readBookingList(malformed, { limit: 20, offset: 0 }),
      BookingListContractError,
      JSON.stringify(malformed),
    )
  }
})

test('разбор карточки: подтверждённые поля фактического ответа', () => {
  const booking = readBooking({
    id: 'b1',
    fullName: 'Заглушка Заглушкин',
    passportNumber: 'AN1234567',
    phone: '+996 555 00-00-00',
    email: null,
    desiredAreaSqm: '60.00',
    status: 'active',
    managerId: 'm1',
    contractId: null,
    buyerConsentVersion: '2026-09-17-draft1',
    buyerConsentConfirmedAt: '2026-09-17T02:39:05.476Z',
    createdAt: '2026-09-17T02:39:05.478Z',
    updatedAt: '2026-09-17T02:39:05.478Z',
  })

  assert.equal(booking?.managerId, 'm1')
  assert.equal(booking?.contractId, null)
  assert.equal(booking?.buyerConsentVersion, '2026-09-17-draft1')
  assert.equal(booking?.updatedAt, '2026-09-17T02:39:05.478Z')

  // Сервер не отдаёт вложенный объект менеджера — только managerId.
  const withUnknownExtras = readBooking({
    id: 'b2',
    managerId: 'm2',
    manager: { id: 'm2', fullName: 'Не должно читаться' },
  })

  assert.equal(withUnknownExtras?.managerId, 'm2')
})

test('разбор карточки: без id это не бронь', () => {
  assert.equal(readBooking({ fullName: 'Без идентификатора' }), null)
  assert.equal(readBooking(null), null)
})

test('правило managerId (API 0.2.0): директору обязателен, начальнику продаж — нет', () => {
  assert.equal(managerRequiredOnCreate('director'), true)
  assert.equal(managerRequiredOnCreate('head_of_sales'), false)
  assert.equal(managerRequiredOnCreate('sales_manager'), false)
})

test('правило managerId: выбор показываем только директору и начальнику продаж', () => {
  assert.equal(managerSelectableOnCreate('director'), true)
  assert.equal(managerSelectableOnCreate('head_of_sales'), true)
  assert.equal(managerSelectableOnCreate('sales_manager'), false)
  assert.equal(managerSelectableOnCreate('accountant'), false)
})

test('правило managerId: директору доступны sales_manager и head_of_sales, начальнику продаж — только его команда', () => {
  assert.deepEqual(assignableManagerRoles('director'), [
    'sales_manager',
    'head_of_sales',
  ])
  assert.deepEqual(assignableManagerRoles('head_of_sales'), ['sales_manager'])
  assert.deepEqual(assignableManagerRoles('sales_manager'), [])
})

test('активный сотрудник — только status: "active", неизвестное значение не считаем активным', () => {
  assert.equal(isActiveStaff({ status: 'active' }), true)
  assert.equal(isActiveStaff({ status: 'disabled' }), false)
  assert.equal(isActiveStaff({ status: 'pending' }), false)
})
