export const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

/** "2026-09" → { from: "2026-09-01", to: "2026-09-30" }. Чистая календарная арифметика, без часового пояса. */
export function monthRange(
  period: string,
): { from: string; to: string } | null {
  const match = PERIOD_PATTERN.exec(period)

  if (!match) {
    return null
  }

  const [, yearText, monthText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()

  return {
    from: `${yearText}-${monthText}-01`,
    to: `${yearText}-${monthText}-${String(lastDay).padStart(2, '0')}`,
  }
}
