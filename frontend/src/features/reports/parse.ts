import type { ReportType } from './access.ts'

export interface CategoryTotal {
  category: string
  label: string
  type: 'income' | 'expense'
  count: number
  amountTyiyn: string
}
export interface FinancialData {
  incomeTyiyn: string
  expenseTyiyn: string
  netTyiyn: string
  byCategory: CategoryTotal[]
}
export interface NotOpenedEmployee {
  userId: string
  fullName: string
}
export interface SalesData {
  newBookings: { count: number; areaSqm: string }
  newContracts: { count: number; areaSqm: string; totalAmountTyiyn: string }
  depositsPaid: { count: number; amountTyiyn: string }
  attendance: {
    teamSize: number
    opened: number
    onDayOff: number
    notOpened: NotOpenedEmployee[]
  }
}
export interface DailyReport {
  id: string
  type: ReportType
  date: string
  generatedAt: string
  summary: string
  data: FinancialData | SalesData
}
export interface ReportList {
  items: DailyReport[]
  total: number
  limit: number
  offset: number
}
export interface Dashboard {
  from: string
  to: string
  bookings: { status: string; count: number; areaSqm: string }[]
  contracts: {
    status: string
    count: number
    areaSqm: string
    totalAmountTyiyn: string
  }[]
  depositsPaid: { count: number; amountTyiyn: string }
  payrollConfirmed: {
    entries: number
    finalAmountTyiyn: string
    taxAmountTyiyn: string
    fineAmountTyiyn: string
  }
  attendance: { missedShifts: number }
  accounting: FinancialData
}
export interface SalesAnalytics {
  from: string
  to: string
  totals: {
    bookedAreaSqm: string
    soldAreaSqm: string
    soldAmountTyiyn: string
  }
  perManager: {
    userId: string
    fullName: string
    role: string
    bookings: { count: number; areaSqm: string }
    signedContracts: {
      count: number
      areaSqm: string
      totalAmountTyiyn: string
    }
    attendance: { workedShifts: number; missedShifts: number; dayOffs: number }
  }[]
}

export class ReportsContractError extends Error {
  constructor() {
    super('Сервер вернул данные отчётов в неожиданном формате.')
    this.name = 'ReportsContractError'
  }
}
const fail = (): never => {
  throw new ReportsContractError()
}
const record = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail()
const str = (v: unknown): string =>
  typeof v === 'string' && v.trim() !== '' ? v : fail()
const count = (v: unknown): number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : fail()
const money = (v: unknown, signed = false): string => {
  const s = str(v)
  return (signed ? /^-?(0|[1-9]\d*)$/ : /^(0|[1-9]\d*)$/).test(s) ? s : fail()
}
const area = (v: unknown): string => {
  const s = str(v)
  return /^\d+\.\d{2}$/.test(s) ? s : fail()
}
const date = (v: unknown): string => {
  const s = str(v)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fail()
}
const list = <T>(v: unknown, read: (item: unknown) => T): T[] =>
  Array.isArray(v) ? v.map(read) : fail()
const booking = (v: unknown) => {
  const r = record(v)
  return { count: count(r.count), areaSqm: area(r.areaSqm) }
}
const contract = (v: unknown) => {
  const r = record(v)
  return { ...booking(r), totalAmountTyiyn: money(r.totalAmountTyiyn) }
}
const deposit = (v: unknown) => {
  const r = record(v)
  return { count: count(r.count), amountTyiyn: money(r.amountTyiyn) }
}
const category = (v: unknown): CategoryTotal => {
  const r = record(v)
  const type = str(r.type)
  if (type !== 'income' && type !== 'expense') return fail()
  return {
    category: str(r.category),
    label: str(r.label),
    type,
    count: count(r.count),
    amountTyiyn: money(r.amountTyiyn),
  }
}
const financial = (v: unknown): FinancialData => {
  const r = record(v)
  return {
    incomeTyiyn: money(r.incomeTyiyn),
    expenseTyiyn: money(r.expenseTyiyn),
    netTyiyn: money(r.netTyiyn, true),
    byCategory: list(r.byCategory, category),
  }
}
/**
 * Форма элемента подтверждена живьём 2026-09-18 (см. `REPORTS_API_RESEARCH.md`):
 * `{ userId, fullName }` — та же пара полей, что и в `perManager` из
 * `GET /analytics/sales`.
 */
const notOpenedEmployee = (v: unknown): NotOpenedEmployee => {
  const r = record(v)
  return { userId: str(r.userId), fullName: str(r.fullName) }
}
const sales = (v: unknown): SalesData => {
  const r = record(v)
  const a = record(r.attendance)
  return {
    newBookings: booking(r.newBookings),
    newContracts: contract(r.newContracts),
    depositsPaid: deposit(r.depositsPaid),
    attendance: {
      teamSize: count(a.teamSize),
      opened: count(a.opened),
      onDayOff: count(a.onDayOff),
      notOpened: list(a.notOpened, notOpenedEmployee),
    },
  }
}

export function readDailyReport(v: unknown): DailyReport {
  const r = record(v)
  const type = str(r.type)
  if (type !== 'financial' && type !== 'sales') return fail()
  const generatedAt = str(r.generatedAt)
  if (Number.isNaN(Date.parse(generatedAt))) fail()
  return {
    id: str(r.id),
    type,
    date: date(r.date),
    generatedAt,
    summary: typeof r.summary === 'string' ? r.summary : fail(),
    data: type === 'financial' ? financial(r.data) : sales(r.data),
  }
}
export function readReportList(v: unknown): ReportList {
  const r = record(v)
  return {
    items: list(r.items, readDailyReport),
    total: count(r.total),
    limit: count(r.limit),
    offset: count(r.offset),
  }
}
export function readDashboard(v: unknown): Dashboard {
  const r = record(v),
    payroll = record(r.payrollConfirmed),
    attendance = record(r.attendance)
  return {
    from: date(r.from),
    to: date(r.to),
    bookings: list(r.bookings, (item) => {
      const b = record(item)
      return { status: str(b.status), ...booking(b) }
    }),
    contracts: list(r.contracts, (item) => {
      const c = record(item)
      return { status: str(c.status), ...contract(c) }
    }),
    depositsPaid: deposit(r.depositsPaid),
    payrollConfirmed: {
      entries: count(payroll.entries),
      finalAmountTyiyn: money(payroll.finalAmountTyiyn),
      taxAmountTyiyn: money(payroll.taxAmountTyiyn),
      fineAmountTyiyn: money(payroll.fineAmountTyiyn),
    },
    attendance: { missedShifts: count(attendance.missedShifts) },
    accounting: financial(r.accounting),
  }
}
export function readSalesAnalytics(v: unknown): SalesAnalytics {
  const r = record(v),
    totals = record(r.totals)
  return {
    from: date(r.from),
    to: date(r.to),
    totals: {
      bookedAreaSqm: area(totals.bookedAreaSqm),
      soldAreaSqm: area(totals.soldAreaSqm),
      soldAmountTyiyn: money(totals.soldAmountTyiyn),
    },
    perManager: list(r.perManager, (item) => {
      const m = record(item),
        a = record(m.attendance)
      return {
        userId: str(m.userId),
        fullName: str(m.fullName),
        role: str(m.role),
        bookings: booking(m.bookings),
        signedContracts: contract(m.signedContracts),
        attendance: {
          workedShifts: count(a.workedShifts),
          missedShifts: count(a.missedShifts),
          dayOffs: count(a.dayOffs),
        },
      }
    }),
  }
}
