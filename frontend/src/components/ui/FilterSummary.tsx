import { XIcon } from '@phosphor-icons/react/dist/ssr'
import type { ReactNode } from 'react'

export interface ActiveFilterChip {
  key: string
  label: string
  onRemove: () => void
}

/**
 * Строка результата (дизайн-контракт, п.9): количество найденного и
 * активные фильтры — отдельными убираемыми «чипами», а не только текстом
 * внутри самой формы фильтров.
 */
export function FilterSummary({
  resultsText,
  chips,
}: {
  resultsText: ReactNode
  chips: ActiveFilterChip[]
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p aria-live="polite" className="text-sm text-muted">
        {resultsText}
      </p>
      {chips.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                onClick={chip.onRemove}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                {chip.label}
                <XIcon size={12} aria-hidden="true" />
                <span className="sr-only">— убрать фильтр</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default FilterSummary
