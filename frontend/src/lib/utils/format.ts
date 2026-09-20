import { DEFAULT_LOCALE } from '@/lib/constants'

export function formatDate(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  }).format(new Date(value))
}
