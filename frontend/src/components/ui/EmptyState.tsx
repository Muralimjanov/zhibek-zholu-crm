import type { ReactNode } from 'react'

/**
 * Пустое состояние отвечает на три вопроса (дизайн-контракт, п.9): чего
 * сейчас нет, почему это нормально, что можно сделать дальше. `action`
 * показывают только тем, у кого есть право на него — решает вызывающий код.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {title}
      </p>
      {description ? (
        <p className="max-w-sm text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export default EmptyState
