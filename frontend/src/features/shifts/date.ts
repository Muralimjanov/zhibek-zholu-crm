/**
 * API работает по времени Бишкека (UTC+6, без перехода на летнее время).
 * Ограничение «дата не в прошлом» для выходного нужно проверять по
 * бишкекскому календарному дню, а не по локальному дню браузера — иначе
 * пользователь в другом часовом поясе увидит неверную границу.
 */
const BISHKEK_UTC_OFFSET_MINUTES = 6 * 60
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function todayInBishkek(): string {
  const now = new Date()
  const shifted = new Date(now.getTime() + BISHKEK_UTC_OFFSET_MINUTES * 60_000)

  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
