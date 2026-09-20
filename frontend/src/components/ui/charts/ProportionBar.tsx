/**
 * Полоса пропорций (приход/расход, забронировано/продано и т.п.): сегменты
 * шириной по доле, плюс легенда текстом под ней — значения читаются даже
 * без восприятия цвета.
 */

export interface ProportionSegment {
  key: string
  label: string
  value: number
  displayValue: string
  barClassName: string
}

export function ProportionBar({ segments }: { segments: ProportionSegment[] }) {
  const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0)

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        {segments.map((s) => (
          <div
            key={s.key}
            aria-hidden="true"
            className={`h-full transition-[width] duration-500 ${s.barClassName}`}
            style={{
              width:
                total > 0 ? `${(Math.max(s.value, 0) / total) * 100}%` : '0%',
            }}
          />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {segments.map((s) => (
          <li
            key={s.key}
            className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400"
          >
            <span
              aria-hidden="true"
              className={`inline-block size-2 shrink-0 rounded-full ${s.barClassName}`}
            />
            <span>
              {s.label}:{' '}
              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                {s.displayValue}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ProportionBar
