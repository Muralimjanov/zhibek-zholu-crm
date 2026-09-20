import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatPercent, formatTyiynAsSom } from '../contracts/money.ts'
import {
  canConfirmPayrollEntry,
  canManagePayroll,
  canViewAllPayrollEntries,
  canViewOwnPayroll,
  canViewPayrollSection,
  canViewPayrollSettings,
  canCorrectPayrollEntry,
  isPayrollEntryEditable,
} from './access.ts'
import {
  PayrollEntryContractError,
  PayrollEntryListContractError,
  PayrollSettingsContractError,
  readPayrollEntryList,
  readPayrollEntryOrThrow,
  readPayrollSettings,
} from './parse.ts'

// Запуск: npm test (Node 22 исполняет TypeScript напрямую, зависимостей нет).

test('правила доступа: настройки видят директор (чтение) и бухгалтер (управление), остальным — нет', () => {
  assert.equal(canViewPayrollSettings('director'), true)
  assert.equal(canViewPayrollSettings('accountant'), true)
  assert.equal(canViewPayrollSettings('sales_manager'), false)
  assert.equal(canViewPayrollSettings('head_of_sales'), false)
})

test('правила доступа: писать настройки, генерировать месяц, править и подтверждать может только бухгалтер (подтверждено 403 директору)', () => {
  assert.equal(canManagePayroll('accountant'), true)
  assert.equal(canManagePayroll('director'), false)
  assert.equal(canManagePayroll('sales_manager'), false)
  assert.equal(canManagePayroll('investor'), false)
})

test('правила доступа: собственная зарплата у менеджера и бухгалтера; начальнику продаж GET /payroll/entries отвечает 403 (подтверждено живьём 18.09.2026, RELEASE_READINESS_REVIEW.md) — вопреки прежнему предположению', () => {
  assert.equal(canViewOwnPayroll('sales_manager'), true)
  assert.equal(canViewOwnPayroll('head_of_sales'), false)
  assert.equal(canViewOwnPayroll('accountant'), true)
  assert.equal(canViewOwnPayroll('director'), false)
  assert.equal(canViewOwnPayroll('investor'), false)
})

test('правила доступа: директор видит весь список начислений (только чтение) — подтверждено живьём 2026-09-18, GET /payroll/entries вернул 200 с чужой записью, не 403/пусто', () => {
  assert.equal(canViewAllPayrollEntries('director'), true)
  assert.equal(canViewAllPayrollEntries('accountant'), true)
  assert.equal(canViewAllPayrollEntries('sales_manager'), false)
  assert.equal(canViewAllPayrollEntries('head_of_sales'), false)
  assert.equal(canViewAllPayrollEntries('investor'), false)
})

test('правила доступа: раздел зарплаты скрыт от инвестора и от начальника продаж (403 на единственный доступный ему запрос)', () => {
  assert.equal(canViewPayrollSection('director'), true)
  assert.equal(canViewPayrollSection('accountant'), true)
  assert.equal(canViewPayrollSection('sales_manager'), true)
  assert.equal(canViewPayrollSection('head_of_sales'), false)
  assert.equal(canViewPayrollSection('investor'), false)
})

test('правила доступа: confirmed нельзя ни править, ни подтверждать повторно — даже бухгалтеру (подтверждено 409 PAYROLL_ENTRY_CONFIRMED)', () => {
  assert.equal(isPayrollEntryEditable({ status: 'draft' }), true)
  assert.equal(isPayrollEntryEditable({ status: 'confirmed' }), false)
  assert.equal(isPayrollEntryEditable({ status: null }), false)
  assert.equal(isPayrollEntryEditable({ status: 'неизвестно' }), false)

  assert.equal(canCorrectPayrollEntry('accountant', { status: 'draft' }), true)
  assert.equal(
    canCorrectPayrollEntry('accountant', { status: 'confirmed' }),
    false,
  )
  assert.equal(canCorrectPayrollEntry('director', { status: 'draft' }), false)

  assert.equal(canConfirmPayrollEntry('accountant', { status: 'draft' }), true)
  assert.equal(
    canConfirmPayrollEntry('accountant', { status: 'confirmed' }),
    false,
  )
})

test('разбор настроек: пустое тело до первой настройки — это null, не ошибка', () => {
  assert.equal(readPayrollSettings(undefined), null)
})

test('разбор настроек: фактический ответ PUT/GET /payroll/settings под бухгалтером', () => {
  const settings = readPayrollSettings({
    finePerMissedShiftTyiyn: '100000',
    taxRatePercent: '10.00',
    updatedAt: '2026-09-17T17:31:31.354Z',
  })

  assert.equal(settings?.finePerMissedShiftTyiyn, '100000')
  assert.equal(settings?.taxRatePercent, '10.00')
})

test('разбор настроек: нарушение контракта — не пустое тело и не полный объект', () => {
  for (const malformed of [null, 'строка', [], {}, { taxRatePercent: '10' }]) {
    assert.throws(
      () => readPayrollSettings(malformed),
      PayrollSettingsContractError,
      JSON.stringify(malformed),
    )
  }
})

test('разбор списка начислений: подтверждённая форма — голый массив, БЕЗ конверта items/total', () => {
  const list = readPayrollEntryList([
    { id: 'e1', period: '2026-09', status: 'draft' },
  ])

  assert.equal(list.length, 1)
  assert.equal(list[0].status, 'draft')
})

test('разбор списка начислений: конверт { items, total } — тоже нарушение контракта для payroll', () => {
  assert.throws(
    () =>
      readPayrollEntryList({
        items: [{ id: 'e1' }],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    PayrollEntryListContractError,
  )
})

test('разбор списка начислений: не массив — нарушение контракта, а не пустой список', () => {
  for (const malformed of [null, undefined, 'строка', {}]) {
    assert.throws(
      () => readPayrollEntryList(malformed),
      PayrollEntryListContractError,
      JSON.stringify(malformed),
    )
  }
})

test('разбор списка начислений: один некорректный элемент — весь список не показываем как достоверный', () => {
  assert.throws(
    () => readPayrollEntryList([{ id: 'e1' }, { period: '2026-09' }]),
    PayrollEntryListContractError,
  )
})

test('разбор одного начисления: фактический ответ GET /payroll/entries/{id} после подтверждения', () => {
  const entry = readPayrollEntryOrThrow({
    id: 'e1',
    userId: 'u1',
    employeeFullName: 'Демо Бухгалтер',
    employeeRole: 'accountant',
    period: '2026-09',
    baseSalaryTyiyn: '3000000',
    missedShiftsCount: 0,
    finePerMissedShiftTyiyn: '100000',
    fineAmountTyiyn: '0',
    fineManuallyAdjusted: false,
    taxRatePercent: '10.00',
    taxAmountTyiyn: '300000',
    finalAmountTyiyn: '2700000',
    status: 'confirmed',
    confirmedById: 'u1',
    confirmedAt: '2026-09-17T17:35:53.327Z',
  })

  assert.equal(entry.status, 'confirmed')
  assert.equal(entry.finalAmountTyiyn, '2700000')
})

test('разбор одного начисления: без id — нарушение контракта', () => {
  assert.throws(
    () => readPayrollEntryOrThrow({ period: '2026-09' }),
    PayrollEntryContractError,
  )
})

test('денежные суммы: подтверждённая живьём формула отображается как пришла с сервера, без пересчёта на клиенте', () => {
  // Фактический ответ PATCH /payroll/entries/{id} (PAYROLL_API_EXAMPLES.md):
  // 3 000 000 тыйын оклад, 10.00% налог → 300 000 тыйын налога,
  // 0 штрафа → 2 700 000 тыйын к выплате. Клиент эти суммы не считает —
  // только форматирует то, что вернул сервер.
  assert.equal(formatTyiynAsSom('3000000'), '30 000,00 сом')
  assert.equal(formatTyiynAsSom('300000'), '3 000,00 сом')
  assert.equal(formatTyiynAsSom('2700000'), '27 000,00 сом')
  assert.equal(formatPercent('10.00'), '10 %')
})
