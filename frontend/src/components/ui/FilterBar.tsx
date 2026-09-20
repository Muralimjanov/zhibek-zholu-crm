import type { ReactNode } from 'react'

/**
 * Визуально отделяет форму фильтров от таблицы данных (дизайн-контракт,
 * п.9: «компактная панель фильтров» — отдельная карточка, не слитная с
 * списком).
 */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-zinc-200 bg-surface p-4 dark:border-zinc-800">
      {children}
    </div>
  )
}

export default FilterBar
