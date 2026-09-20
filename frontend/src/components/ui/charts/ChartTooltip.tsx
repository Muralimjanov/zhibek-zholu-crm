import type { ReactNode } from 'react'
import { CHART_TOOLTIP_BG } from './chartTheme'

/**
 * Общая рамка кастомного recharts-tooltip: та же геометрия/поверхность, что
 * у карточек (`rounded-control`, тень), но фон — отдельный `--chart-tooltip-bg`
 * (не `bg-surface`), чтобы тултип не сливался с самой картой на графике.
 * Tooltip дополняет видимые значения, а не заменяет их — легенда/подписи
 * читаются и без наведения.
 */
export function ChartTooltip({
  label,
  children,
}: {
  label?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className="rounded-control border border-zinc-200 px-3 py-2 text-xs shadow-md dark:border-zinc-700"
      style={{ background: CHART_TOOLTIP_BG }}
    >
      {label ? (
        <p className="font-semibold text-zinc-900 dark:text-zinc-50">{label}</p>
      ) : null}
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  )
}

export default ChartTooltip
