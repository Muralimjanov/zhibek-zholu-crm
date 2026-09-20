import type { BadgeTone } from '@/components/ui/Badge'

/** Статусы фактического API (`CONTRACTS_API_EXAMPLES.md`); неизвестное показываем как есть. */
const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  deposit_paid: 'Взнос оплачен',
  signed: 'Подписан',
}

export function formatContractStatus(status: string | null): string {
  if (!status) {
    return '—'
  }

  return STATUS_LABELS[status] ?? status
}

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  deposit_paid: 'info',
  signed: 'success',
}

export function contractStatusTone(status: string | null): BadgeTone {
  return (status && STATUS_TONE[status]) || 'neutral'
}

export function formatDate(value: string | null): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
