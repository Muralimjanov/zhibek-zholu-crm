import type { ReactNode } from 'react'

/** Карточка-рамка вокруг таблицы — отдельная от `FilterBar` (дизайн-контракт, п.9). */
export function TableCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-zinc-200 dark:border-zinc-800">
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

export default TableCard
