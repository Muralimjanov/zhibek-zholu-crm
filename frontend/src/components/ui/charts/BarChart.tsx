import type { BadgeTone } from '@/components/ui/Badge'

/**
 * Горизонтальная столбчатая диаграмма без библиотек: подпись и число — тот
 * же текст, что и раньше в `<Metric>`, полоса лишь дублирует его визуально
 * (цвет не единственный носитель смысла — доступность). Ширину полос при
 * `prefers-reduced-motion` анимация не двигает — общее правило в globals.css.
 */

export interface BarChartItem {
  key: string
  label: string
  value: number
  displayValue: string
  barClassName: string
  /** Необязательно: исходный тон статуса — recharts-обёртки (см. `StatusBarChart`) берут цвет отсюда, не парсят `barClassName`. */
  tone?: BadgeTone
}

export function BarChart({ items }: { items: BarChartItem[] }) {
  const max = Math.max(1, ...items.map((item) => item.value))

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">
              {item.label}
            </span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {item.displayValue}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              aria-hidden="true"
              className={`h-full rounded-full transition-[width] duration-500 ${item.barClassName}`}
              style={{
                width:
                  item.value <= 0
                    ? '0%'
                    : `${Math.max((item.value / max) * 100, 3)}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export default BarChart
