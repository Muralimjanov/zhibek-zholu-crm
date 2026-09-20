import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allowedReportTypes,
  canViewDashboard,
  canViewSalesAnalytics,
} from './access.ts'
import { reportSearch } from './filters.ts'
import { formatGeneratedAt } from './labels.ts'
import {
  readDailyReport,
  readDashboard,
  readReportList,
  readSalesAnalytics,
  ReportsContractError,
} from './parse.ts'

const financial = {
  id: '<report-id>',
  type: 'financial',
  date: '2026-09-17',
  generatedAt: '2026-09-17T16:44:25.426Z',
  summary: 'Строка 1\nСтрока 2',
  data: {
    incomeTyiyn: '0',
    expenseTyiyn: '200000',
    netTyiyn: '-200000',
    byCategory: [],
  },
}
const sales = {
  id: '<sales-id>',
  type: 'sales',
  date: '2026-09-18',
  generatedAt: '2026-09-17T21:02:12.076Z',
  summary: 'Продажи',
  data: {
    newBookings: { count: 0, areaSqm: '0.00' },
    newContracts: { count: 0, areaSqm: '0.00', totalAmountTyiyn: '0' },
    depositsPaid: { count: 0, amountTyiyn: '0' },
    attendance: {
      teamSize: 1,
      opened: 0,
      onDayOff: 0,
      notOpened: [{ userId: '<user-id>', fullName: 'Сотрудник' }],
    },
  },
}
test('права разделены по ролям', () => {
  assert.deepEqual(allowedReportTypes('director'), ['financial', 'sales'])
  assert.deepEqual(allowedReportTypes('investor'), ['financial', 'sales'])
  assert.deepEqual(allowedReportTypes('accountant'), ['financial'])
  assert.deepEqual(allowedReportTypes('head_of_sales'), ['sales'])
  assert.deepEqual(allowedReportTypes('sales_manager'), [])
  assert.equal(canViewDashboard('investor'), true)
  assert.equal(canViewDashboard('accountant'), false)
  assert.equal(canViewSalesAnalytics('head_of_sales'), true)
  assert.equal(canViewSalesAnalytics('accountant'), false)
})
test('formatGeneratedAt: время снимка показывается в Asia/Bishkek — общий формат для архива и карточки', () => {
  assert.equal(
    formatGeneratedAt('2026-09-17T21:02:12.076Z'),
    '18 сент. 2026 г., 03:02',
  )
  assert.equal(
    formatGeneratedAt('2026-09-17T16:44:25.426Z'),
    '17 сент. 2026 г., 22:44',
  )
})
test('фильтры и пагинация передаются явно', () => {
  assert.equal(
    reportSearch({
      type: 'sales',
      from: '2026-09-01',
      to: '2026-09-18',
      limit: 20,
      offset: 40,
    }),
    'type=sales&from=2026-09-01&to=2026-09-18&limit=20&offset=40',
  )
  assert.equal(reportSearch({ limit: 20, offset: 0 }), 'limit=20&offset=0')
})
test('денежные строки и снимок отчёта сохраняются без пересчёта', () => {
  assert.equal(readDailyReport(financial).data.netTyiyn, '-200000')
  const item = readDailyReport(sales)
  assert.equal(item.type, 'sales')
  if (item.type === 'sales') {
    assert.equal(item.data.attendance.notOpened.length, 1)
    assert.deepEqual(item.data.attendance.notOpened[0], {
      userId: '<user-id>',
      fullName: 'Сотрудник',
    })
  }
  assert.equal(
    readReportList({
      items: [financial, sales],
      total: 2,
      limit: 20,
      offset: 0,
    }).items.length,
    2,
  )
})
test('attendance.notOpened: форма элемента `{ userId, fullName }` подтверждена живьём 2026-09-18 (закрытие смены начальника продаж с одним неоткрывшим менеджером в команде); пустой массив и некорректный элемент обрабатываются отдельно', () => {
  const empty = readDailyReport({
    ...sales,
    data: {
      ...sales.data,
      attendance: { ...sales.data.attendance, notOpened: [] },
    },
  })
  if (empty.type === 'sales') {
    assert.deepEqual(empty.data.attendance.notOpened, [])
  }
  assert.throws(
    () =>
      readDailyReport({
        ...sales,
        data: {
          ...sales.data,
          attendance: {
            ...sales.data.attendance,
            notOpened: [{ userId: '<user-id>' }],
          },
        },
      }),
    ReportsContractError,
    'элемент без fullName — нарушение контракта, не подстановка заглушки',
  )
})
test('неполный ответ или элемент списка вызывают ошибку контракта', () => {
  assert.throws(
    () => readDailyReport({ ...financial, data: { incomeTyiyn: '0' } }),
    ReportsContractError,
  )
  assert.throws(
    () =>
      readReportList({
        items: [financial, {}],
        total: 2,
        limit: 20,
        offset: 0,
      }),
    ReportsContractError,
  )
  assert.throws(
    () => readReportList({ items: [], total: 0 }),
    ReportsContractError,
  )
})
test('сводка и аналитика проверяют вложенные поля', () => {
  const d = {
    from: '2026-09-01',
    to: '2026-09-18',
    bookings: [],
    contracts: [],
    depositsPaid: { count: 0, amountTyiyn: '0' },
    payrollConfirmed: {
      entries: 1,
      finalAmountTyiyn: '2700000',
      taxAmountTyiyn: '300000',
      fineAmountTyiyn: '0',
    },
    attendance: { missedShifts: 0 },
    accounting: financial.data,
  }
  assert.equal(readDashboard(d).accounting.netTyiyn, '-200000')
  assert.throws(
    () => readDashboard({ ...d, payrollConfirmed: {} }),
    ReportsContractError,
  )
  const analytics = {
    from: d.from,
    to: d.to,
    totals: {
      bookedAreaSqm: '0.00',
      soldAreaSqm: '0.00',
      soldAmountTyiyn: '0',
    },
    perManager: [
      {
        userId: '<user-id>',
        fullName: 'Сотрудник',
        role: 'head_of_sales',
        bookings: sales.data.newBookings,
        signedContracts: { count: 0, areaSqm: '0.00', totalAmountTyiyn: '0' },
        attendance: { workedShifts: 0, missedShifts: 0, dayOffs: 0 },
      },
    ],
  }
  assert.equal(readSalesAnalytics(analytics).perManager.length, 1)
  assert.throws(
    () => readSalesAnalytics({ ...analytics, perManager: [{}] }),
    ReportsContractError,
  )
})
