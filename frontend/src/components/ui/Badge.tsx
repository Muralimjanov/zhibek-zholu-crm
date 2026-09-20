import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

/**
 * `brand` (тёплый бирюзовый) — цвет главного действия, у статусов не
 * используется, чтобы CTA-кнопки не путались со статусной пилюлей. Для
 * статусного смысла — `info` (синий): например, «активная бронь».
 *
 * Статус текстом + цветом одновременно (не только цвет — доступность),
 * единый вид пилюли для всех таблиц вместо голого текста статуса.
 */
const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  info: 'bg-blue-50 text-info dark:bg-blue-950',
  success: 'bg-green-50 text-success dark:bg-green-950',
  warning: 'bg-amber-50 text-warning dark:bg-amber-950',
  danger: 'bg-red-50 text-danger dark:bg-red-950',
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  )
}

/** Тот же набор тонов сплошным цветом — для полос диаграмм рядом с бейджами тех же статусов. */
const TONE_BAR_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-zinc-400 dark:bg-zinc-600',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export function badgeToneBarClass(tone: BadgeTone): string {
  return TONE_BAR_CLASS[tone]
}

export default Badge
