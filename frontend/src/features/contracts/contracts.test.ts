import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assignableManagerRoles,
  isActiveStaff,
  managerRequiredOnCreate,
  managerSelectableOnCreate,
} from './access.ts'
import {
  formatPercent,
  formatSignedTyiynAsSom,
  formatTyiynAsSom,
  normalizeDecimal2Input,
  somToTyiyn,
} from './money.ts'
import {
  ContractListContractError,
  readContract,
  readContractList,
} from './parse.ts'

// Запуск: npm test (Node 22 исполняет TypeScript напрямую, зависимостей нет).

test('сом → тыйын: точная целочисленная арифметика', () => {
  assert.equal(somToTyiyn('50000'), '5000000')
  assert.equal(somToTyiyn('50000.50'), '5000050')
  assert.equal(somToTyiyn('50000,5'), '5000050', 'запятая как разделитель')
  assert.equal(somToTyiyn('0.01'), '1')
  assert.equal(somToTyiyn('0'), '0')
  assert.equal(somToTyiyn(' 50 000 '), '5000000', 'пробелы по краям и внутри')
})

test('сом → тыйын: недопустимые значения отбрасываются', () => {
  for (const value of [
    '',
    '  ',
    'abc',
    '-5',
    '50000.555',
    '1e3',
    '12.',
    '.5',
  ]) {
    assert.equal(somToTyiyn(value), null, value)
  }
})

test('тыйын → сом: показ с разрядами и двумя знаками', () => {
  assert.equal(formatTyiynAsSom('5000000'), '50 000,00 сом')
  assert.equal(formatTyiynAsSom('227500000'), '2 275 000,00 сом')
  assert.equal(formatTyiynAsSom('1'), '0,01 сом')
  assert.equal(formatTyiynAsSom('100'), '1,00 сом')
  assert.equal(formatTyiynAsSom('0'), '0,00 сом')
  assert.equal(formatTyiynAsSom(null), '—')
  assert.equal(
    formatTyiynAsSom('не число'),
    '—',
    'мусор не выдаёт нулевую сумму',
  )
})

test('сом → тыйын → сом: обратимость на крупных суммах', () => {
  const som = '3000000'
  const tyiyn = somToTyiyn(som)

  assert.equal(tyiyn, '300000000')
  assert.equal(formatTyiynAsSom(tyiyn), '3 000 000,00 сом')
})

test('тыйын → сом со знаком: отрицательный итог сводки (расход больше прихода)', () => {
  assert.equal(formatSignedTyiynAsSom('-200000'), '-2 000,00 сом')
  assert.equal(formatSignedTyiynAsSom('200000'), '2 000,00 сом')
  assert.equal(formatSignedTyiynAsSom('0'), '0,00 сом')
  assert.equal(formatSignedTyiynAsSom(null), '—')
  assert.equal(formatSignedTyiynAsSom('-не число'), '—')
})

test('процент: показ с русским разделителем, без лишних нулей', () => {
  assert.equal(formatPercent('30.00'), '30 %')
  assert.equal(formatPercent('30.50'), '30,50 %')
  assert.equal(formatPercent(null), '—')
})

test('площадь/процент: нормализация ввода', () => {
  assert.equal(normalizeDecimal2Input('45,50'), '45.5')
  assert.equal(normalizeDecimal2Input('030'), '30')
  assert.equal(normalizeDecimal2Input('abc'), null)
})

test('разбор карточки: полный ответ директора', () => {
  const contract = readContract({
    id: 'c1',
    status: 'draft',
    areaSqm: '45.50',
    pricePerSqmTyiyn: '5000000',
    totalAmountTyiyn: '227500000',
    depositPercent: '30.00',
    depositAmountTyiyn: '68250000',
    depositPaid: false,
    depositPaidAt: null,
    hasFile: false,
    managerId: 'm1',
    bookingId: null,
    createdAt: '2026-09-17T02:39:05.483Z',
    updatedAt: '2026-09-17T02:39:05.483Z',
    fullName: 'Заглушка Заглушкин',
    passportNumber: '*******0000',
    address: 'г. Ош, ул. Ленина 1',
    phone: '+996*********',
    email: null,
    buyerConsentVersion: '2026-09-17-draft1',
    buyerConsentConfirmedAt: '2026-09-17T02:39:05.476Z',
  })

  assert.equal(contract?.status, 'draft')
  assert.equal(contract?.depositPaid, false)
  assert.equal(contract?.hasFile, false)
  assert.equal(contract?.fullName, 'Заглушка Заглушкин')
  assert.equal(contract?.bookingId, null)
})

test('разбор карточки: бухгалтерское представление без PII — это не мусор', () => {
  // Подтверждено описанием GET /contracts в OpenAPI: "Accountant receives a
  // finance-only view without buyer PII" — полей покупателя в ответе нет.
  const contract = readContract({
    id: 'c1',
    status: 'draft',
    areaSqm: '45.50',
    pricePerSqmTyiyn: '5000000',
    totalAmountTyiyn: '227500000',
    depositPercent: '30.00',
    depositAmountTyiyn: '68250000',
    depositPaid: false,
    depositPaidAt: null,
    hasFile: false,
    managerId: 'm1',
    bookingId: null,
    createdAt: '2026-09-17T02:39:05.483Z',
    updatedAt: '2026-09-17T02:39:05.483Z',
  })

  assert.equal(contract?.id, 'c1')
  assert.equal(contract?.fullName, null)
  assert.equal(contract?.passportNumber, null)
  assert.equal(contract?.address, null)
  assert.equal(contract?.totalAmountTyiyn, '227500000')
})

test('разбор карточки: без id это не договор', () => {
  assert.equal(readContract({ status: 'draft' }), null)
  assert.equal(readContract(null), null)
})

test('разбор списка: форма { items, total, limit, offset }', () => {
  const list = readContractList(
    {
      items: [{ id: 'c1', status: 'signed' }],
      total: 1,
      limit: 50,
      offset: 0,
    },
    { limit: 50, offset: 0 },
  )

  assert.equal(list.total, 1)
  assert.equal(list.items.length, 1)
  assert.equal(list.items[0].status, 'signed')
})

test('разбор списка: настоящий пустой список — это items: []', () => {
  const list = readContractList(
    { items: [], total: 0, limit: 20, offset: 0 },
    { limit: 20, offset: 0 },
  )

  assert.deepEqual(list, { items: [], total: 0, limit: 20, offset: 0 })
})

test('разбор списка: нарушение контракта — это ошибка, а не пустой список', () => {
  for (const malformed of [null, undefined, 'строка', [{ id: 'c1' }], {}]) {
    assert.throws(
      () => readContractList(malformed, { limit: 20, offset: 0 }),
      ContractListContractError,
      JSON.stringify(malformed),
    )
  }
})

test('правило managerId (API 0.2.0, совпадает с бронированиями): директору обязателен', () => {
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

test('активный сотрудник — только status: "active"', () => {
  assert.equal(isActiveStaff({ status: 'active' }), true)
  assert.equal(isActiveStaff({ status: 'disabled' }), false)
})
