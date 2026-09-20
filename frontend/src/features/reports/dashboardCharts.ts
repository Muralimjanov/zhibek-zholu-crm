import type { BadgeTone } from '@/components/ui/Badge'
import type { BarChartItem } from '@/components/ui/charts/BarChart'
import type { ProportionSegment } from '@/components/ui/charts/ProportionBar'
import type { SalesRouteNode } from '@/components/ui/charts/SalesRoute'
import type { DailyReport, FinancialData, SalesData } from './parse.ts'

/**
 * Чистые типизированные адаптеры «сырых» полей `/dashboard` (см.
 * `parse.ts`) в данные диаграмм и KPI. Ничего не пересчитывается и не
 * оценивается — только выбор уже присланного сервером поля и форматирование
 * (дизайн-контракт, «Главное правило данных»: без вымышленных процентов,
 * дельт и прогнозов). Компонент диаграммы не видит `Dashboard` напрямую —
 * только результат этих функций.
 *
 * Тип не импортируется из `./parse.ts`, чтобы не тянуть сюда `import type`
 * с реальными полями; адаптеры принимают только те срезы `Dashboard`,
 * которые им реально нужны — так их проще тестировать модулем без алиасов
 * (`node --experimental-strip-types`, см. `bookings.test.ts` и соседей).
 */

export interface DashboardBookingsByStatus {
  status: string
  count: number
  areaSqm: string
}

export interface DashboardContractsByStatus {
  status: string
  count: number
  areaSqm: string
  totalAmountTyiyn: string
}

export interface DashboardFinancialCategory {
  category: string
  label: string
  type: 'income' | 'expense'
  count: number
  amountTyiyn: string
}

export interface DashboardKpiInput {
  bookings: DashboardBookingsByStatus[]
  contracts: DashboardContractsByStatus[]
  depositsPaid: { count: number; amountTyiyn: string }
  payrollConfirmed: { entries: number; finalAmountTyiyn: string }
  accounting: { netTyiyn: string }
  attendance: { missedShifts: number }
}

export interface DashboardKpi {
  key: string
  label: string
  value: string
  /** Только для длинных денежных сумм — короткая версия становится главной строкой, `value` уходит в подпись «Точно». Не выдумывать для площади/счётчиков. */
  compactValue?: string
  context?: string
}

type Formatters = {
  money: (value: string | null) => string
  signedMoney: (value: string | null) => string
  bookingStatusLabel: (status: string) => string
  contractStatusLabel: (status: string) => string
  bookingStatusTone: (status: string | null) => BadgeTone
  contractStatusTone: (status: string | null) => BadgeTone
  transactionTypeTone: (type: 'income' | 'expense' | null) => BadgeTone
  toneBarClass: (tone: BadgeTone) => string
}

/** Только для ширины полос диаграммы — не для точных сумм (те выводятся форматтером из вызывающего кода). */
function tyiynAsApproxSom(value: string): number {
  return Number(value) / 100
}

// `123n`-литералы недоступны при текущем `target` в tsconfig.json (ES2017);
// `BigInt(123)` — та же целочисленная арифметика, без литерального синтаксиса.
const BIGINT_ZERO = BigInt(0)
const BIGINT_100 = BigInt(100)
const BIGINT_10 = BigInt(10)
/** Ниже этого числа сомов сокращение не нужно — суммы и так короткие. Отдельная константа, а не `COMPACT_SOM_SUFFIXES[2]`, чтобы порядок/состав списка ниже можно было менять, не трогая этот порог. */
const COMPACT_SOM_FLOOR = BigInt(1_000)
const COMPACT_SOM_SUFFIXES = [
  {
    threshold: BigInt(1_000_000_000),
    divisor: BigInt(1_000_000_000),
    suffix: 'млрд',
  },
  { threshold: BigInt(1_000_000), divisor: BigInt(1_000_000), suffix: 'млн' },
  { threshold: BigInt(1_000), divisor: BigInt(1_000), suffix: 'тыс.' },
] as const

/**
 * "4100000,00" сом → "4,1 млн сом" — только декоративное сокращение для
 * длинных KPI-значений (дизайн-контракт: число не должно переноситься
 * внутри). Целочисленная `BigInt`-арифметика на исходной строке тыйынов —
 * без `Number`/float, чтобы не терять точность на крупных суммах.
 * Возвращает `null`, если сумма меньше 1000 сом (короткая — сокращать
 * незачем, вызывающий код показывает только `value`) или строка не похожа
 * на целое число тыйынов.
 */
export function formatCompactSom(tyiynValue: string): string | null {
  const match = /^(-)?(0|[1-9]\d*)$/.exec(tyiynValue)

  if (!match) {
    return null
  }

  const [, sign, digits] = match
  const somWhole = BigInt(digits) / BIGINT_100

  if (somWhole < COMPACT_SOM_FLOOR) {
    return null
  }

  for (const { threshold, divisor, suffix } of COMPACT_SOM_SUFFIXES) {
    if (somWhole >= threshold) {
      const tenths = (somWhole * BIGINT_10) / divisor
      const whole = tenths / BIGINT_10
      const decimal = tenths % BIGINT_10
      const number =
        decimal === BIGINT_ZERO ? `${whole}` : `${whole},${decimal}`

      return `${sign ?? ''}${number} ${suffix} сом`
    }
  }

  return null
}

/**
 * Порядок статусов фиксирован по бизнес-процессу (дизайн-контракт, п.7.2/
 * 7.3), а не по тому, в каком порядке их прислал сервер — иначе полосы
 * диаграммы переставлялись бы местами от ответа к ответу без причины,
 * видимой пользователю. Неизвестный статус идёт после всех известных, под
 * своим именем с сервера (не переименовывается). `Array.prototype.sort`
 * стабилен (гарантия ES2019) — несколько неизвестных статусов между собой
 * сохраняют исходный порядок ответа.
 */
function statusRank(status: string, order: readonly string[]): number {
  const index = order.indexOf(status)

  return index === -1 ? order.length : index
}

function sortByStatus<T extends { status: string }>(
  items: T[],
  order: readonly string[],
): T[] {
  return items
    .slice()
    .sort((a, b) => statusRank(a.status, order) - statusRank(b.status, order))
}

const BOOKING_STATUS_ORDER = ['active', 'converted', 'cancelled'] as const
const CONTRACT_STATUS_ORDER = ['draft', 'deposit_paid', 'signed'] as const

export function bookingsBarItems(
  bookings: DashboardBookingsByStatus[],
  fmt: Pick<
    Formatters,
    'bookingStatusLabel' | 'bookingStatusTone' | 'toneBarClass'
  >,
): BarChartItem[] {
  return sortByStatus(bookings, BOOKING_STATUS_ORDER).map((x) => ({
    key: x.status,
    label: fmt.bookingStatusLabel(x.status),
    value: x.count,
    displayValue: `${x.count} · ${x.areaSqm} м²`,
    barClassName: fmt.toneBarClass(fmt.bookingStatusTone(x.status)),
    tone: fmt.bookingStatusTone(x.status),
  }))
}

export function contractsBarItems(
  contracts: DashboardContractsByStatus[],
  fmt: Pick<
    Formatters,
    'contractStatusLabel' | 'contractStatusTone' | 'toneBarClass' | 'money'
  >,
): BarChartItem[] {
  return sortByStatus(contracts, CONTRACT_STATUS_ORDER).map((x) => ({
    key: x.status,
    label: fmt.contractStatusLabel(x.status),
    value: x.count,
    displayValue: `${x.count} · ${x.areaSqm} м² · ${fmt.money(x.totalAmountTyiyn)}`,
    barClassName: fmt.toneBarClass(fmt.contractStatusTone(x.status)),
    tone: fmt.contractStatusTone(x.status),
  }))
}

export function accountingProportionSegments(
  accounting: { incomeTyiyn: string; expenseTyiyn: string },
  fmt: Pick<Formatters, 'money' | 'transactionTypeTone' | 'toneBarClass'>,
): ProportionSegment[] {
  return [
    {
      key: 'income',
      label: 'Приход',
      value: tyiynAsApproxSom(accounting.incomeTyiyn),
      displayValue: fmt.money(accounting.incomeTyiyn),
      barClassName: fmt.toneBarClass(fmt.transactionTypeTone('income')),
    },
    {
      key: 'expense',
      label: 'Расход',
      value: tyiynAsApproxSom(accounting.expenseTyiyn),
      displayValue: fmt.money(accounting.expenseTyiyn),
      barClassName: fmt.toneBarClass(fmt.transactionTypeTone('expense')),
    },
  ]
}

/** Отсортировано по сумме по убыванию (дизайн-контракт, п.7.4) — срез «первые 6» решает компонент, не адаптер. */
export function accountingCategoryBarItems(
  categories: DashboardFinancialCategory[],
  fmt: Pick<Formatters, 'money' | 'transactionTypeTone' | 'toneBarClass'>,
): BarChartItem[] {
  return categories
    .filter((x) => x.count > 0)
    .slice()
    .sort((a, b) => Number(b.amountTyiyn) - Number(a.amountTyiyn))
    .map((x) => ({
      key: x.category,
      label: `${x.label} · ${x.count}`,
      value: tyiynAsApproxSom(x.amountTyiyn),
      displayValue: fmt.money(x.amountTyiyn),
      barClassName: fmt.toneBarClass(fmt.transactionTypeTone(x.type)),
    }))
}

/**
 * Четыре узла маршрута продаж (п.7.1): не воронка с принудительно убывающей
 * шириной — `/dashboard` отдаёт агрегаты статусов за период, а не когорту
 * одного набора сделок, поэтому визуально сравнивать их как последовательно
 * убывающие (или как проценты конверсии) было бы аналитически неверно.
 * `hrefs` — только для тех разделов, куда у роли есть доступ; недостающий
 * `href` даёт нередактируемый узел (инвестору узлы не становятся фиктивными
 * ссылками).
 */
export function salesRouteStages(
  input: Pick<DashboardKpiInput, 'bookings' | 'contracts' | 'depositsPaid'>,
  fmt: Pick<Formatters, 'money'>,
  hrefs: { bookings?: string; contracts?: string } = {},
): SalesRouteNode[] {
  const active = input.bookings.find((x) => x.status === 'active')
  const converted = input.bookings.find((x) => x.status === 'converted')
  const depositPaid = input.contracts.find((x) => x.status === 'deposit_paid')
  const signed = input.contracts.find((x) => x.status === 'signed')

  return [
    {
      key: 'active',
      label: 'Активные брони',
      href: hrefs.bookings,
      count: active?.count ?? 0,
      metricLabel: 'Площадь',
      metricValue: `${active?.areaSqm ?? '0.00'} м²`,
    },
    {
      key: 'converted',
      label: 'Перешли в договор',
      href: hrefs.bookings,
      count: converted?.count ?? 0,
      metricLabel: 'Площадь',
      metricValue: `${converted?.areaSqm ?? '0.00'} м²`,
    },
    {
      key: 'deposit',
      label: 'Взнос оплачен',
      href: hrefs.contracts,
      count: depositPaid?.count ?? 0,
      metricLabel: 'Площадь',
      metricValue: `${depositPaid?.areaSqm ?? '0.00'} м²`,
    },
    {
      key: 'signed',
      label: 'Договор подписан',
      href: hrefs.contracts,
      count: signed?.count ?? 0,
      metricLabel: 'Сумма',
      metricValue: fmt.money(signed?.totalAmountTyiyn ?? '0'),
    },
  ]
}

/**
 * KPI-ряд (п.6): каждое значение — прямое поле `/dashboard`, без сложения
 * разнородных статусов и без процентов/дельт. «Забронировано» — счётчик
 * именно активных броней (не сумма всех статусов): перешедшие в договор и
 * отменённые уже показаны отдельно ступенью ниже.
 */
export function dashboardKpis(
  input: DashboardKpiInput,
  fmt: Pick<Formatters, 'money' | 'signedMoney'>,
): DashboardKpi[] {
  const active = input.bookings.find((x) => x.status === 'active')
  const signed = input.contracts.find((x) => x.status === 'signed')
  const signedTotal = signed?.totalAmountTyiyn ?? '0'
  const depositsTotal = input.depositsPaid.amountTyiyn
  const netTotal = input.accounting.netTyiyn
  const payrollTotal = input.payrollConfirmed.finalAmountTyiyn

  return [
    {
      key: 'activeBookedArea',
      label: 'Забронировано (активные)',
      value: `${active?.areaSqm ?? '0.00'} м²`,
      context: active ? `${active.count} шт.` : '0 шт.',
    },
    {
      key: 'signedContracts',
      label: 'Заключено договоров',
      value: fmt.money(signedTotal),
      compactValue: formatCompactSom(signedTotal) ?? undefined,
      context: signed ? `${signed.count} шт. · ${signed.areaSqm} м²` : '0 шт.',
    },
    {
      key: 'depositsPaid',
      label: 'Оплаченные взносы',
      value: fmt.money(depositsTotal),
      compactValue: formatCompactSom(depositsTotal) ?? undefined,
      context: `${input.depositsPaid.count} шт.`,
    },
    {
      key: 'netTotal',
      label: 'Финансовый итог',
      value: fmt.signedMoney(netTotal),
      compactValue: formatCompactSom(netTotal) ?? undefined,
    },
    {
      key: 'payrollConfirmed',
      label: 'К выплате (подтверждено)',
      value: fmt.money(payrollTotal),
      compactValue: formatCompactSom(payrollTotal) ?? undefined,
      context: `${input.payrollConfirmed.entries} шт.`,
    },
    {
      key: 'missedShifts',
      label: 'Пропущено смен',
      value: String(input.attendance.missedShifts),
    },
  ]
}

export interface DonutBalanceInput {
  incomeApprox: number
  expenseApprox: number
  incomeDisplay: string
  expenseDisplay: string
  /** Точная сумма — не заменяется, всегда доступна рядом (легенда/подпись центра). */
  netLabel: string
  /** Короткая версия для центра кольца, только когда `netLabel` длинный. */
  netCompactLabel?: string
}

/** «Приход и расход» (кольцо): те же поля, что и `accountingProportionSegments`, только форма под донат-компонент — сумма в центре берётся из готового `netTyiyn`, не пересчитывается из сегментов. */
export function donutBalanceInput(
  accounting: { incomeTyiyn: string; expenseTyiyn: string; netTyiyn: string },
  fmt: Pick<Formatters, 'money' | 'signedMoney'>,
): DonutBalanceInput {
  return {
    incomeApprox: tyiynAsApproxSom(accounting.incomeTyiyn),
    expenseApprox: tyiynAsApproxSom(accounting.expenseTyiyn),
    incomeDisplay: fmt.money(accounting.incomeTyiyn),
    expenseDisplay: fmt.money(accounting.expenseTyiyn),
    netLabel: fmt.signedMoney(accounting.netTyiyn),
    netCompactLabel: formatCompactSom(accounting.netTyiyn) ?? undefined,
  }
}

/**
 * Срез архивного отчёта, который нужен временным диаграммам — не полный
 * `DailyReport` (без `id`/`generatedAt`/`summary`), чтобы адаптер не тянул
 * лишние поля и тест мог собрать фикстуру без них.
 */
type ReportSlice = Pick<DailyReport, 'type' | 'date' | 'data'>

/**
 * Сортировка по дате по возрастанию — обязательна перед построением
 * временного ряда: `GET /daily-reports` не гарантирует порядок ответа.
 * Не создаёт и не заполняет отсутствующие календарные дни — отсутствие
 * ежедневного отчёта не значит нулевую активность (см. «Главное правило
 * данных»), поэтому в ряду остаются только реально сформированные дни.
 */
export function sortReportsByDate<T extends { date: string }>(
  reports: readonly T[],
): T[] {
  return reports.slice().sort((a, b) => a.date.localeCompare(b.date))
}

export interface SalesLinePoint {
  date: string
  newBookings: number
  newContracts: number
  depositsPaid: number
}

/** «Продажи по дням»: три серии из архивных `type: "sales"`-отчётов, один отчёт — одна точка. */
export function salesLineSeries(
  reports: readonly ReportSlice[],
): SalesLinePoint[] {
  return sortReportsByDate(reports)
    .filter(
      (report): report is ReportSlice & { data: SalesData } =>
        report.type === 'sales',
    )
    .map((report) => ({
      date: report.date,
      newBookings: report.data.newBookings.count,
      newContracts: report.data.newContracts.count,
      depositsPaid: report.data.depositsPaid.count,
    }))
}

export interface CashFlowPoint {
  date: string
  incomeTyiyn: string
  expenseTyiyn: string
  /** Только для геометрии SVG (высота area/деления оси Y) — точная подпись всегда строится из `incomeTyiyn`/`expenseTyiyn`. */
  incomeApprox: number
  expenseApprox: number
}

/** «Денежный поток по дням»: приход/расход из архивных `type: "financial"`-отчётов. */
export function cashFlowAreaSeries(
  reports: readonly ReportSlice[],
): CashFlowPoint[] {
  return sortReportsByDate(reports)
    .filter(
      (report): report is ReportSlice & { data: FinancialData } =>
        report.type === 'financial',
    )
    .map((report) => ({
      date: report.date,
      incomeTyiyn: report.data.incomeTyiyn,
      expenseTyiyn: report.data.expenseTyiyn,
      incomeApprox: tyiynAsApproxSom(report.data.incomeTyiyn),
      expenseApprox: tyiynAsApproxSom(report.data.expenseTyiyn),
    }))
}

/** Подпись деления оси X: "2026-09-15" → "15.09". Дата уже валидирована `parse.ts` как `YYYY-MM-DD` — без часового пояса и без `Date`. */
export function formatChartAxisDate(value: string): string {
  const [, month, day] = value.split('-')

  return `${day}.${month}`
}

/** Полная дата для tooltip/подписи одиночной точки: "2026-09-15" → "15.09.2026". */
export function formatChartFullDate(value: string): string {
  const [year, month, day] = value.split('-')

  return `${day}.${month}.${year}`
}
