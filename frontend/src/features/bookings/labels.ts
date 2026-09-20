import type { BadgeTone } from '@/components/ui/Badge'

/** Статусы из описания `GET /bookings`; неизвестное показываем как есть. */
const STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  converted: 'Переведена в договор',
  cancelled: 'Отменена',
}

export function formatBookingStatus(status: string | null): string {
  if (!status) {
    return '—'
  }

  return STATUS_LABELS[status] ?? status
}

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'info',
  converted: 'success',
  cancelled: 'neutral',
}

export function bookingStatusTone(status: string | null): BadgeTone {
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
