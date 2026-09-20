const bookingStatus: Record<string, string> = {
  active: 'Активные',
  converted: 'Перешли в договор',
  cancelled: 'Отменённые',
}

const contractStatus: Record<string, string> = {
  draft: 'Черновики',
  deposit_paid: 'Взнос оплачен',
  signed: 'Подписанные',
}

export function bookingStatusLabel(status: string): string {
  return bookingStatus[status] ?? status
}

export function contractStatusLabel(status: string): string {
  return contractStatus[status] ?? status
}

/**
 * Общий формат для `generatedAt` в архиве и в карточке отчёта — чтобы
 * снимок выглядел одинаково в обоих местах (см. CLAUDE_REPORTS_SNAPSHOT_REVIEW.md).
 */
export function formatGeneratedAt(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bishkek',
  }).format(new Date(iso))
}
