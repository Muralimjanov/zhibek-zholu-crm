import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accountingCategoryBarItems,
  accountingProportionSegments,
  bookingsBarItems,
  cashFlowAreaSeries,
  contractsBarItems,
  dashboardKpis,
  formatCompactSom,
  salesLineSeries,
  salesRouteStages,
  sortReportsByDate,
} from './dashboardCharts.ts'

const money = (v: string | null) => `${v ?? '—'}т`
const signedMoney = (v: string | null) => `${v ?? '—'}т`
const bookingStatusLabel = (s: string) => `booking:${s}`
const contractStatusLabel = (s: string) => `contract:${s}`
const bookingStatusTone = () => 'neutral' as const
const contractStatusTone = () => 'neutral' as const
const transactionTypeTone = () => 'neutral' as const
const toneBarClass = (tone: string) => `bar-${tone}`

test('bookingsBarItems: поле в поле, без пересчёта', () => {
  const items = bookingsBarItems(
    [{ status: 'active', count: 3, areaSqm: '10.00' }],
    { bookingStatusLabel, bookingStatusTone, toneBarClass },
  )

  assert.equal(items.length, 1)
  assert.equal(items[0].key, 'active')
  assert.equal(items[0].label, 'booking:active')
  assert.equal(items[0].value, 3)
  assert.equal(items[0].displayValue, '3 · 10.00 м²')
  assert.equal(items[0].barClassName, 'bar-neutral')
})

test('bookingsBarItems: порядок фиксирован по бизнес-процессу, не по ответу сервера', () => {
  const items = bookingsBarItems(
    [
      { status: 'cancelled', count: 1, areaSqm: '1.00' },
      { status: 'active', count: 2, areaSqm: '2.00' },
      { status: 'converted', count: 3, areaSqm: '3.00' },
    ],
    { bookingStatusLabel, bookingStatusTone, toneBarClass },
  )

  assert.deepEqual(
    items.map((x) => x.key),
    ['active', 'converted', 'cancelled'],
  )
})

test('bookingsBarItems: неизвестный статус идёт после известных, под своим именем', () => {
  const items = bookingsBarItems(
    [
      { status: 'weird', count: 1, areaSqm: '1.00' },
      { status: 'converted', count: 2, areaSqm: '2.00' },
      { status: 'active', count: 3, areaSqm: '3.00' },
    ],
    { bookingStatusLabel, bookingStatusTone, toneBarClass },
  )

  assert.deepEqual(
    items.map((x) => x.key),
    ['active', 'converted', 'weird'],
  )
  assert.equal(items[2].label, 'booking:weird')
})

test('contractsBarItems: порядок фиксирован — draft, deposit_paid, signed', () => {
  const items = contractsBarItems(
    [
      {
        status: 'signed',
        count: 1,
        areaSqm: '1.00',
        totalAmountTyiyn: '1',
      },
      {
        status: 'draft',
        count: 2,
        areaSqm: '2.00',
        totalAmountTyiyn: '2',
      },
      {
        status: 'deposit_paid',
        count: 3,
        areaSqm: '3.00',
        totalAmountTyiyn: '3',
      },
    ],
    { contractStatusLabel, contractStatusTone, toneBarClass, money },
  )

  assert.deepEqual(
    items.map((x) => x.key),
    ['draft', 'deposit_paid', 'signed'],
  )
})

test('contractsBarItems: сумма форматируется вызывающим форматтером, не пересчитывается', () => {
  const items = contractsBarItems(
    [
      {
        status: 'signed',
        count: 1,
        areaSqm: '80.00',
        totalAmountTyiyn: '4000000',
      },
    ],
    { contractStatusLabel, contractStatusTone, toneBarClass, money },
  )

  assert.equal(items[0].displayValue, '1 · 80.00 м² · 4000000т')
})

test('accountingCategoryBarItems: сортировка по сумме по убыванию, нулевые категории отфильтрованы', () => {
  const items = accountingCategoryBarItems(
    [
      {
        category: 'a',
        label: 'A',
        type: 'expense',
        count: 1,
        amountTyiyn: '100',
      },
      {
        category: 'b',
        label: 'B',
        type: 'income',
        count: 2,
        amountTyiyn: '500',
      },
      {
        category: 'c',
        label: 'C',
        type: 'expense',
        count: 0,
        amountTyiyn: '999999',
      },
    ],
    { money, transactionTypeTone, toneBarClass },
  )

  assert.deepEqual(
    items.map((x) => x.key),
    ['b', 'a'],
  )
})

test('accountingProportionSegments: два сегмента приход/расход, значения — реальные поля', () => {
  const segments = accountingProportionSegments(
    { incomeTyiyn: '10000', expenseTyiyn: '4000' },
    { money, transactionTypeTone, toneBarClass },
  )

  assert.equal(segments.length, 2)
  assert.equal(segments[0].displayValue, '10000т')
  assert.equal(segments[1].displayValue, '4000т')
})

test('salesRouteStages: четыре плоских узла, без брони/договора нужного статуса — 0, а не падает', () => {
  const stages = salesRouteStages(
    {
      bookings: [],
      contracts: [],
      depositsPaid: { count: 0, amountTyiyn: '0' },
    },
    { money },
  )

  assert.deepEqual(
    stages.map((x) => x.key),
    ['active', 'converted', 'deposit', 'signed'],
  )
  assert.equal(stages[0].count, 0)
  assert.equal(stages[0].metricValue, '0.00 м²')
  assert.equal(stages[3].metricValue, '0т')
})

test('salesRouteStages: реальные поля без пересчёта — count и площадь/сумма как есть', () => {
  const stages = salesRouteStages(
    {
      bookings: [{ status: 'active', count: 4, areaSqm: '120.50' }],
      contracts: [
        {
          status: 'signed',
          count: 2,
          areaSqm: '80.00',
          totalAmountTyiyn: '4000000',
        },
      ],
      depositsPaid: { count: 0, amountTyiyn: '0' },
    },
    { money },
  )

  assert.equal(stages[0].count, 4)
  assert.equal(stages[0].metricValue, '120.50 м²')
  assert.equal(stages[3].count, 2)
  assert.equal(stages[3].metricValue, '4000000т')
})

test('salesRouteStages: href передаётся только для указанных разделов, не становится фиктивной ссылкой', () => {
  const stages = salesRouteStages(
    {
      bookings: [],
      contracts: [],
      depositsPaid: { count: 0, amountTyiyn: '0' },
    },
    { money },
    { bookings: '/bookings' },
  )

  assert.equal(stages[0].href, '/bookings')
  assert.equal(stages[1].href, '/bookings')
  assert.equal(stages[2].href, undefined)
  assert.equal(stages[3].href, undefined)
})

test('dashboardKpis: KPI берутся из статусов active/signed напрямую, без сложения по всем статусам', () => {
  const kpis = dashboardKpis(
    {
      bookings: [
        { status: 'active', count: 2, areaSqm: '15.00' },
        { status: 'converted', count: 5, areaSqm: '999.00' },
      ],
      contracts: [
        {
          status: 'signed',
          count: 1,
          areaSqm: '80.00',
          totalAmountTyiyn: '4000000',
        },
      ],
      depositsPaid: { count: 1, amountTyiyn: '1200000' },
      payrollConfirmed: { entries: 0, finalAmountTyiyn: '0' },
      accounting: { netTyiyn: '-40000' },
      attendance: { missedShifts: 0 },
    },
    { money, signedMoney },
  )

  const bookedArea = kpis.find((k) => k.key === 'activeBookedArea')

  assert.equal(bookedArea?.value, '15.00 м²')
  assert.equal(bookedArea?.context, '2 шт.')
})

const salesData = (overrides: { newBookings?: number } = {}) => ({
  newBookings: { count: overrides.newBookings ?? 1, areaSqm: '10.00' },
  newContracts: { count: 2, areaSqm: '20.00', totalAmountTyiyn: '100' },
  depositsPaid: { count: 3, amountTyiyn: '300' },
  attendance: { teamSize: 5, opened: 4, onDayOff: 1, notOpened: [] },
})

const financialData = (overrides: { incomeTyiyn?: string } = {}) => ({
  incomeTyiyn: overrides.incomeTyiyn ?? '5000',
  expenseTyiyn: '2000',
  netTyiyn: '3000',
  byCategory: [],
})

test('sortReportsByDate: сортирует от старой даты к новой, не мутирует исходный массив', () => {
  const input = [
    { date: '2026-09-03' },
    { date: '2026-09-01' },
    { date: '2026-09-02' },
  ]

  const sorted = sortReportsByDate(input)

  assert.deepEqual(
    sorted.map((x) => x.date),
    ['2026-09-01', '2026-09-02', '2026-09-03'],
  )
  assert.equal(input[0].date, '2026-09-03', 'исходный массив не изменён')
})

test('salesLineSeries: sales-отчёты превращаются в три корректные серии по датам', () => {
  const series = salesLineSeries([
    { type: 'sales', date: '2026-09-02', data: salesData({ newBookings: 7 }) },
    { type: 'sales', date: '2026-09-01', data: salesData({ newBookings: 4 }) },
  ])

  assert.deepEqual(
    series.map((x) => x.date),
    ['2026-09-01', '2026-09-02'],
  )
  assert.equal(series[0].newBookings, 4)
  assert.equal(series[0].newContracts, 2)
  assert.equal(series[0].depositsPaid, 3)
  assert.equal(series[1].newBookings, 7)
})

test('salesLineSeries: financial-отчёты в списке игнорируются — серии sales и financial не смешиваются', () => {
  const series = salesLineSeries([
    { type: 'financial', date: '2026-09-01', data: financialData() },
    { type: 'sales', date: '2026-09-02', data: salesData() },
  ])

  assert.equal(series.length, 1)
  assert.equal(series[0].date, '2026-09-02')
})

test('cashFlowAreaSeries: financial-отчёты превращаются в income/expense-серию с точной строкой и приближённым числом', () => {
  const series = cashFlowAreaSeries([
    {
      type: 'financial',
      date: '2026-09-01',
      data: financialData({ incomeTyiyn: '150050' }),
    },
  ])

  assert.equal(series.length, 1)
  assert.equal(series[0].incomeTyiyn, '150050')
  assert.equal(series[0].expenseTyiyn, '2000')
  assert.equal(series[0].incomeApprox, 1500.5)
})

test('salesLineSeries: отсутствующие календарные дни не дополняются нулями', () => {
  const series = salesLineSeries([
    { type: 'sales', date: '2026-09-01', data: salesData() },
    { type: 'sales', date: '2026-09-05', data: salesData() },
  ])

  assert.equal(series.length, 2)
  assert.deepEqual(
    series.map((x) => x.date),
    ['2026-09-01', '2026-09-05'],
  )
})

test('salesLineSeries: одна запись остаётся одной точкой, а не дорисованной линией', () => {
  const series = salesLineSeries([
    { type: 'sales', date: '2026-09-01', data: salesData() },
  ])

  assert.equal(series.length, 1)
})

test('formatCompactSom: тысячи', () => {
  assert.equal(formatCompactSom('100000000'), '1 млн сом')
  assert.equal(formatCompactSom('99999900'), '999,9 тыс. сом')
})

test('formatCompactSom: миллионы', () => {
  assert.equal(formatCompactSom('150000000'), '1,5 млн сом')
  assert.equal(formatCompactSom('410000000'), '4,1 млн сом')
})

test('formatCompactSom: миллиарды', () => {
  assert.equal(formatCompactSom('230000000000'), '2,3 млрд сом')
})

test('formatCompactSom: отрицательное значение сохраняет знак', () => {
  assert.equal(formatCompactSom('-410000000'), '-4,1 млн сом')
})

test('formatCompactSom: граничные случаи — ровно порог и чуть ниже', () => {
  // 999 сом (99900 тыйын) — короче тысячи, сокращать незачем
  assert.equal(formatCompactSom('99900'), null)
  // ровно 1000 сом — уже сокращается
  assert.equal(formatCompactSom('100000'), '1 тыс. сом')
  // ровно 1 000 000 сом — переход к млн, не "1000 тыс."
  assert.equal(formatCompactSom('100000000'), '1 млн сом')
})

test('formatCompactSom: некорректная строка и нулевая сумма', () => {
  assert.equal(formatCompactSom('abc'), null)
  assert.equal(formatCompactSom('0'), null)
})

test('dashboardKpis: длинная сумма получает compactValue, а точное value не пересчитывается из округлённого', () => {
  const kpis = dashboardKpis(
    {
      bookings: [],
      contracts: [
        {
          status: 'signed',
          count: 1,
          areaSqm: '80.00',
          totalAmountTyiyn: '410000000',
        },
      ],
      depositsPaid: { count: 0, amountTyiyn: '0' },
      payrollConfirmed: { entries: 0, finalAmountTyiyn: '0' },
      accounting: { netTyiyn: '410000000' },
      attendance: { missedShifts: 3 },
    },
    { money, signedMoney },
  )

  const signedKpi = kpis.find((k) => k.key === 'signedContracts')

  assert.equal(signedKpi?.compactValue, '4,1 млн сом')
  assert.equal(
    signedKpi?.value,
    money('410000000'),
    'точное значение — тот же форматтер, не производное от compactValue',
  )
})

test('dashboardKpis: KPI без денежной единицы (площадь, счётчик) не получает compactValue', () => {
  const kpis = dashboardKpis(
    {
      bookings: [{ status: 'active', count: 2, areaSqm: '999999.00' }],
      contracts: [],
      depositsPaid: { count: 0, amountTyiyn: '0' },
      payrollConfirmed: { entries: 0, finalAmountTyiyn: '0' },
      accounting: { netTyiyn: '0' },
      attendance: { missedShifts: 12345 },
    },
    { money, signedMoney },
  )

  const area = kpis.find((k) => k.key === 'activeBookedArea')
  const missed = kpis.find((k) => k.key === 'missedShifts')

  assert.equal(area?.compactValue, undefined)
  assert.equal(missed?.compactValue, undefined)
})
