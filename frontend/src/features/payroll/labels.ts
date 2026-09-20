import type { BadgeTone } from '@/components/ui/Badge'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  confirmed: 'Подтверждено',
}

export function formatPayrollEntryStatus(status: string | null): string {
  if (!status) {
    return '—'
  }

  return STATUS_LABELS[status] ?? status
}

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  confirmed: 'success',
}

export function payrollEntryStatusTone(status: string | null): BadgeTone {
  return (status && STATUS_TONE[status]) || 'neutral'
}

const MONTH_LABELS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

/** "2026-09" → "сентябрь 2026". Не совпадающий формат показываем как есть. */
export function formatPeriod(period: string | null): string {
  if (!period) {
    return '—'
  }

  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period)

  if (!match) {
    return period
  }

  const [, year, month] = match

  return `${MONTH_LABELS[Number(month) - 1]} ${year}`
}

/** `employeeFullName` уже приходит с сервера — сырой `userId` наружу не показываем. */
export function formatEmployeeName(name: string | null): string {
  return name ?? 'Сотрудник недоступен'
}
