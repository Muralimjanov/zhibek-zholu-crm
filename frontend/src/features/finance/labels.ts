import type { BadgeTone } from '@/components/ui/Badge'
import type { TransactionCategory, TransactionType } from '@/types/finance'
import { CATEGORY_INFO } from './categories'

export function formatTransactionType(type: TransactionType | null): string {
  if (type === 'income') {
    return 'Приход'
  }

  if (type === 'expense') {
    return 'Расход'
  }

  return '—'
}

export function transactionTypeTone(type: TransactionType | null): BadgeTone {
  return type === 'income' ? 'success' : 'neutral'
}

/** Неизвестная категория (сервер расширил enum) показывается как есть, а не «—». */
export function formatCategory(category: TransactionCategory | null): string {
  if (!category) {
    return '—'
  }

  return CATEGORY_INFO[category]?.label ?? category
}

/** `null` — сервер не прислал `hasAttachment` — показываем как неизвестно, а не молча «файла нет». */
export function formatAttachmentStatus(hasAttachment: boolean | null): string {
  if (hasAttachment === null) {
    return 'неизвестно'
  }

  return hasAttachment ? 'есть' : 'нет'
}

/** `null` — сервер не прислал `periodClosed` — показываем как неизвестно, а не молча «месяц открыт». */
export function formatPeriodStatus(periodClosed: boolean | null): string {
  if (periodClosed === null) {
    return 'Неизвестно'
  }

  return periodClosed ? 'Закрыт для правок' : 'Открыт'
}
