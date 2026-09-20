/** Тот же часовой пояс Бишкека, что и `shifts/date.ts` — период зарплаты идёт по нему же. */
const BISHKEK_UTC_OFFSET_MINUTES = 6 * 60
export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function currentPeriodInBishkek(): string {
  const now = new Date()
  const shifted = new Date(now.getTime() + BISHKEK_UTC_OFFSET_MINUTES * 60_000)

  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}
