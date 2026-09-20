import type { ReactNode } from 'react'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  ALERT_CLASS,
  SECTION_CLASS,
} from '@/features/bookings/components/section'

/**
 * Общая оболочка карточки диаграммы. Только `plot` живёт в области
 * фиксированной высоты (без прыжков между loading/error/empty/готово) —
 * `supplementary` (легенда, подпись одной точки, `<details>` с таблицей) и
 * `footer` идут обычным потоком ниже и растягивают карточку по контенту,
 * а не обрезаются и не растягивают сам график. Используются только принятые
 * токены/паттерны — `rounded-card`/`Skeleton`/`ErrorState` те же, что и везде
 * в приложении.
 */
export function ChartCard({
  title,
  titleId,
  description,
  action,
  plot,
  supplementary,
  footer,
  isPending,
  isError,
  errorMessage,
  onRetry,
  isEmpty,
  emptyTitle,
  emptyDescription,
  heightClassName = 'h-[260px] sm:h-[300px]',
}: {
  title: ReactNode
  /** id заголовка для `aria-labelledby` на теле графика — связывает карточку с диаграммой для скринридеров. */
  titleId: string
  description?: ReactNode
  action?: ReactNode
  /** Только сам график/loading/error/empty — единственное, что занимает фиксированную высоту. */
  plot: ReactNode
  /** Легенда, подпись одной точки, `<details>` с таблицей — обычный поток, видны только когда plot готов. */
  supplementary?: ReactNode
  footer?: ReactNode
  isPending: boolean
  isError: boolean
  errorMessage?: ReactNode
  onRetry?: () => void
  isEmpty: boolean
  emptyTitle?: string
  emptyDescription?: string
  heightClassName?: string
}) {
  const ready = !isPending && !isError && !isEmpty

  return (
    <section className={`${SECTION_CLASS} min-w-0`} aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id={titleId}
            className="font-semibold text-zinc-900 dark:text-zinc-50"
          >
            {title}
          </h3>
          {description ? (
            <p className="mt-1 text-caption text-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className={`mt-4 ${heightClassName}`}>
        {isPending ? (
          <Skeleton className="h-full w-full" />
        ) : isError ? (
          <div className="flex h-full items-center">
            {onRetry ? (
              <ErrorState
                message={errorMessage ?? 'Не удалось загрузить данные.'}
                onRetry={onRetry}
              />
            ) : (
              <p role="alert" className={ALERT_CLASS}>
                {errorMessage ?? 'Не удалось загрузить данные.'}
              </p>
            )}
          </div>
        ) : isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title={emptyTitle ?? 'Данных нет'}
              description={emptyDescription}
            />
          </div>
        ) : (
          plot
        )}
      </div>

      {ready && supplementary ? (
        <div className="mt-3 min-w-0">{supplementary}</div>
      ) : null}

      {ready && footer ? (
        <p className="mt-3 text-caption text-muted">{footer}</p>
      ) : null}
    </section>
  )
}

export default ChartCard
