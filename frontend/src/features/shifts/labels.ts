import type { BadgeTone } from '@/components/ui/Badge'

const STATUS_LABELS: Record<string, string> = {
  open: 'Открыта',
  closed: 'Закрыта',
  missed: 'Прогул',
}

export function formatShiftStatus(status: string | null): string {
  if (!status) {
    return '—'
  }

  return STATUS_LABELS[status] ?? status
}

const STATUS_TONE: Record<string, BadgeTone> = {
  open: 'info',
  closed: 'neutral',
  missed: 'danger',
}

export function shiftStatusTone(status: string | null): BadgeTone {
  return (status && STATUS_TONE[status]) || 'neutral'
}

/**
 * `openedAt`/`closedAt` — метки времени ISO 8601 (UTC). API работает по
 * времени Бишкека, поэтому часовой пояс задаём явно через `timeZone` —
 * иначе браузер показал бы их в СВОЁМ часовом поясе, который может не
 * совпадать с Бишкеком, и время открытия/закрытия смены выглядело бы
 * неверным для пользователя в другом регионе.
 */
export function formatBishkekDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('ru-RU', {
    timeZone: 'Asia/Bishkek',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** `date` в ответе — уже `YYYY-MM-DD`, без времени: показываем как есть, без часового пояса браузера. */
export function formatDateOnly(value: string | null): string {
  if (!value) {
    return '—'
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (!match) {
    return value
  }

  const [, year, month, day] = match

  return `${day}.${month}.${year}`
}
