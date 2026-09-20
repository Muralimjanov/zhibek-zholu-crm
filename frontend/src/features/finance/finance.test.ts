import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatTyiynAsSom, somToTyiyn } from '../contracts/money.ts'
import {
  canEditTransaction,
  canManageFinance,
  canViewFinanceSection,
  isTransactionEditable,
} from './access.ts'
import {
  TRANSACTION_ATTACHMENT_MAX_BYTES,
  validateTransactionAttachment,
} from './attachment.ts'
import {
  ALL_CATEGORIES,
  categoriesForType,
  isCategoryValidForType,
} from './categories.ts'
import { monthRange } from './date.ts'
import {
  AccountingSummaryContractError,
  readAccountingSummary,
  readTransaction,
  readTransactionList,
  readTransactionOrThrow,
  TransactionContractError,
  TransactionListContractError,
} from './parse.ts'

// Запуск: npm test (Node 22 исполняет TypeScript напрямую, зависимостей нет).

test('правила доступа: раздел бухгалтерии видят директор (просмотр) и бухгалтер (управление)', () => {
  assert.equal(canViewFinanceSection('director'), true)
  assert.equal(canViewFinanceSection('accountant'), true)
  assert.equal(canViewFinanceSection('sales_manager'), false)
  assert.equal(canViewFinanceSection('head_of_sales'), false)
  assert.equal(canViewFinanceSection('investor'), false)
})

test('правила доступа: создавать, править и грузить вложение может только бухгалтер (по таблице ролей — директору только «Просмотр»)', () => {
  assert.equal(canManageFinance('accountant'), true)
  assert.equal(canManageFinance('director'), false)
  assert.equal(canManageFinance('sales_manager'), false)
})

test('правила доступа: закрытый месяц (periodClosed) нельзя править даже бухгалтеру', () => {
  assert.equal(isTransactionEditable({ periodClosed: false }), true)
  assert.equal(isTransactionEditable({ periodClosed: true }), false)
})

test('правила доступа: неизвестное periodClosed (сервер не прислал поле) — тоже нельзя править, а не «по умолчанию открыт»', () => {
  assert.equal(isTransactionEditable({ periodClosed: null }), false)
})

test('правила доступа: canEditTransaction — только автор записи, только свою, только не закрытый месяц (подтверждено описанием PATCH в схеме API 0.3.0)', () => {
  const own = { periodClosed: false, createdById: 'u1' }
  const foreign = { periodClosed: false, createdById: 'u2' }
  const closedOwn = { periodClosed: true, createdById: 'u1' }
  const unknownAuthor = { periodClosed: false, createdById: null }

  assert.equal(canEditTransaction('accountant', 'u1', own), true)
  assert.equal(
    canEditTransaction('accountant', 'u1', foreign),
    false,
    'чужая запись — нельзя, даже другому бухгалтеру',
  )
  assert.equal(canEditTransaction('accountant', 'u1', closedOwn), false)
  assert.equal(canEditTransaction('accountant', 'u1', unknownAuthor), false)
  assert.equal(canEditTransaction('director', 'u1', own), false)
  assert.equal(canEditTransaction('accountant', null, own), false)
})

test('категории: полный список из 14 значений, привязка к типу подтверждена живьём (GET /accounting/summary.byCategory) — все доступны для ручного создания', () => {
  assert.equal(ALL_CATEGORIES.length, 14)
  assert.deepEqual(categoriesForType('income'), [
    'sale_deposit',
    'sale_full_payment',
    'sale_installment',
    'other_income',
  ])
  assert.equal(categoriesForType('expense').length, 10)

  // Раньше эти четыре скрывались в форме создания как предположительно
  // автосоздаваемые сервером. Схема API 0.3.0 подтвердила обратное —
  // backend не создаёт операции автоматически, поэтому они доступны.
  assert.ok(categoriesForType('income').includes('sale_deposit'))
  assert.ok(categoriesForType('income').includes('sale_full_payment'))
  assert.ok(categoriesForType('income').includes('sale_installment'))
  assert.ok(categoriesForType('expense').includes('payroll'))
})

test('категории: isCategoryValidForType — категория обязана принадлежать выбранному типу', () => {
  assert.equal(isCategoryValidForType('income', 'sale_deposit'), true)
  assert.equal(isCategoryValidForType('expense', 'payroll'), true)

  // Устаревшее значение после смены типа — то, от чего защищает форма создания.
  assert.equal(isCategoryValidForType('income', 'payroll'), false)
  assert.equal(isCategoryValidForType('expense', 'sale_deposit'), false)

  assert.equal(isCategoryValidForType('income', ''), false)
  assert.equal(isCategoryValidForType('income', 'не категория'), false)
})

test('вложение: граница 10 МБ — ровно предел проходит, предел + 1 байт отклоняется', () => {
  assert.equal(
    validateTransactionAttachment({ size: TRANSACTION_ATTACHMENT_MAX_BYTES }),
    null,
  )
  assert.equal(
    validateTransactionAttachment({
      size: TRANSACTION_ATTACHMENT_MAX_BYTES + 1,
    }),
    'Файл больше 10 МБ.',
  )
  assert.equal(validateTransactionAttachment({ size: 0 }), null)
  assert.equal(validateTransactionAttachment({ size: 1024 }), null)
})

test('месяц: "2026-09" → первый и последний день календарного месяца', () => {
  assert.deepEqual(monthRange('2026-09'), {
    from: '2026-09-01',
    to: '2026-09-30',
  })
  assert.deepEqual(monthRange('2026-02'), {
    from: '2026-02-01',
    to: '2026-02-28',
  })
  assert.equal(monthRange('не месяц'), null)
})

test('разбор операции: фактический ответ POST /transactions', () => {
  const transaction = readTransaction({
    id: 't1',
    type: 'expense',
    category: 'other_expense',
    subcategory: null,
    amountTyiyn: '150000',
    currency: 'KGS',
    date: '2026-09-18',
    comment: 'Тестовая запись',
    hasAttachment: false,
    relatedContractId: null,
    createdById: 'u1',
    periodClosed: false,
    createdAt: '2026-09-17T18:43:02.606Z',
    updatedAt: '2026-09-17T18:43:02.606Z',
  })

  assert.equal(transaction?.type, 'expense')
  assert.equal(transaction?.periodClosed, false)
  assert.equal(transaction?.hasAttachment, false)
})

test('разбор операции: без id это не операция', () => {
  assert.equal(readTransaction({ type: 'income' }), null)
  assert.equal(readTransaction(null), null)
})

test('разбор операции: неполный ответ — hasAttachment/periodClosed отсутствуют — это null (неизвестно), НЕ false', () => {
  const transaction = readTransaction({ id: 't1' })

  assert.equal(transaction?.hasAttachment, null)
  assert.equal(transaction?.periodClosed, null)
  // null, а не false — иначе неизвестное состояние молча разрешило бы
  // правку записи и показало бы «файла нет» (см. access.ts/labels.ts).
  assert.equal(isTransactionEditable(transaction!), false)
})

test('разбор операции: неполный ответ — hasAttachment/periodClosed пришли не булевыми значениями — тоже null', () => {
  const transaction = readTransaction({
    id: 't1',
    hasAttachment: 'yes',
    periodClosed: 0,
  })

  assert.equal(transaction?.hasAttachment, null)
  assert.equal(transaction?.periodClosed, null)
})

test('разбор одной операции: без id — нарушение контракта', () => {
  assert.throws(
    () => readTransactionOrThrow({ type: 'income' }),
    TransactionContractError,
  )
})

test('разбор списка операций: подтверждённая форма — конверт { items, total, limit, offset }, НЕ голый массив (в отличие от payroll)', () => {
  const list = readTransactionList(
    { items: [{ id: 't1' }], total: 1, limit: 20, offset: 0 },
    { limit: 20, offset: 0 },
  )

  assert.equal(list.total, 1)
  assert.equal(list.items[0].id, 't1')
})

test('разбор списка операций: настоящий пустой список — это items: []', () => {
  const list = readTransactionList(
    { items: [], total: 0, limit: 20, offset: 0 },
    { limit: 20, offset: 0 },
  )

  assert.deepEqual(list, { items: [], total: 0, limit: 20, offset: 0 })
})

test('разбор списка операций: голый массив (форма payroll) — нарушение контракта для finance', () => {
  assert.throws(
    () => readTransactionList([{ id: 't1' }], { limit: 20, offset: 0 }),
    TransactionListContractError,
  )
})

test('разбор списка операций: один некорректный элемент — весь список не показываем как достоверный', () => {
  assert.throws(
    () =>
      readTransactionList(
        {
          items: [{ id: 't1' }, { type: 'income' }],
          total: 2,
          limit: 20,
          offset: 0,
        },
        { limit: 20, offset: 0 },
      ),
    TransactionListContractError,
  )
})

test('разбор сводки: фактический ответ GET /accounting/summary', () => {
  const summary = readAccountingSummary({
    from: '2026-09-01',
    to: '2026-09-30',
    incomeTyiyn: '0',
    expenseTyiyn: '0',
    netTyiyn: '0',
    byCategory: [
      {
        category: 'other_expense',
        label: 'Непредвиденные расходы',
        type: 'expense',
        count: 0,
        amountTyiyn: '0',
      },
    ],
  })

  assert.equal(summary.byCategory.length, 1)
  assert.equal(summary.byCategory[0].label, 'Непредвиденные расходы')
})

test('разбор сводки: нарушение контракта без byCategory', () => {
  assert.throws(
    () => readAccountingSummary({ from: '2026-09-01', to: '2026-09-30' }),
    AccountingSummaryContractError,
  )
})

test('денежные суммы: amountTyiyn положительный — "0" не допускается (в отличие от contracts, где 0 валиден)', () => {
  assert.equal(somToTyiyn('1500'), '150000')
  assert.notEqual(somToTyiyn('0'), null)
  assert.equal(somToTyiyn('0'), '0')
  // Формула отказа нуля — на уровне схемы формы (`schema.ts`), а не money.ts:
  // amountTyiyn API-паттерн `/^[1-9]\d{0,15}$/` не допускает "0", хотя
  // `somToTyiyn` сам по себе его пропускает (он общий для contracts/payroll).
})

test('денежные суммы: показываются как пришли с сервера, без пересчёта на клиенте', () => {
  assert.equal(formatTyiynAsSom('150000'), '1 500,00 сом')
  assert.equal(formatTyiynAsSom('200000'), '2 000,00 сом')
})
