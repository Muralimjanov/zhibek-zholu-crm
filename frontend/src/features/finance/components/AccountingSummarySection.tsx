'use client'

import { useId, useState } from 'react'
import ErrorState from '@/components/ui/ErrorState'
import FilterBar from '@/components/ui/FilterBar'
import {
  TABLE_CELL_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
} from '@/components/ui/table'
import TableCard from '@/components/ui/TableCard'
import TableSkeleton from '@/components/ui/TableSkeleton'
import {
  FIELD_CLASS,
  LABEL_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import {
  formatSignedTyiynAsSom,
  formatTyiynAsSom,
} from '@/features/contracts/money'
import { todayInBishkek } from '@/features/shifts/date'
import { monthRange } from '../date'
import { describeFinanceError } from '../errors'
import { formatCategory } from '../labels'
import { useAccountingSummaryQuery } from '../queries'

type Mode = 'day' | 'month'

/**
 * Сводка за день или месяц — `GET /accounting/summary`. Сервер сам считает
 * итог и разбивку по категориям (`byCategory`); клиент их не пересчитывает,
 * только форматирует (`CLAUDE_FINANCE_TASK.md`).
 */
export function AccountingSummarySection() {
  const dayId = useId()
  const monthId = useId()
  const today = todayInBishkek()

  const [mode, setMode] = useState<Mode>('day')
  const [day, setDay] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))

  const range = mode === 'day' ? { from: day, to: day } : monthRange(month)
  const query = useAccountingSummaryQuery(
    range?.from ?? '',
    range?.to ?? '',
    range !== null,
  )

  return (
    <section
      className={SECTION_CLASS}
      aria-labelledby="finance-summary-heading"
    >
      <h2 id="finance-summary-heading" className={SECTION_TITLE_CLASS}>
        Сводка
      </h2>

      <div className="mt-3">
        <FilterBar>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-2.5">
              <button
                type="button"
                aria-pressed={mode === 'day'}
                onClick={() => {
                  setMode('day')
                }}
                className={
                  mode === 'day'
                    ? SECONDARY_BUTTON_CLASS
                    : 'text-sm text-zinc-500'
                }
              >
                День
              </button>
              <button
                type="button"
                aria-pressed={mode === 'month'}
                onClick={() => {
                  setMode('month')
                }}
                className={
                  mode === 'month'
                    ? SECONDARY_BUTTON_CLASS
                    : 'text-sm text-zinc-500'
                }
              >
                Месяц
              </button>
            </div>

            {mode === 'day' ? (
              <div className="space-y-1.5">
                <label htmlFor={dayId} className={LABEL_CLASS}>
                  Дата
                </label>
                <input
                  id={dayId}
                  type="date"
                  value={day}
                  onChange={(event) => {
                    setDay(event.target.value)
                  }}
                  className={FIELD_CLASS}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor={monthId} className={LABEL_CLASS}>
                  Месяц
                </label>
                <input
                  id={monthId}
                  type="month"
                  value={month}
                  onChange={(event) => {
                    setMonth(event.target.value)
                  }}
                  className={FIELD_CLASS}
                />
              </div>
            )}
          </div>
        </FilterBar>
      </div>

      <div className="mt-4">
        {!range ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Проверьте формат месяца.
          </p>
        ) : query.isPending ? (
          <TableSkeleton
            caption="Загружаем сводку"
            columns={['Категория', 'Операций', 'Сумма']}
            minWidthClassName="min-w-[28rem]"
            rows={3}
          />
        ) : query.isError ? (
          <ErrorState
            message={describeFinanceError(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <div className="space-y-4">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  Приход
                </dt>
                <dd className="text-zinc-900 dark:text-zinc-50">
                  {formatTyiynAsSom(query.data.incomeTyiyn)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  Расход
                </dt>
                <dd className="text-zinc-900 dark:text-zinc-50">
                  {formatTyiynAsSom(query.data.expenseTyiyn)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  Итог
                </dt>
                <dd className="text-zinc-900 dark:text-zinc-50">
                  {formatSignedTyiynAsSom(query.data.netTyiyn)}
                </dd>
              </div>
            </dl>

            {query.data.byCategory.every(
              (entry) => (entry.count ?? 0) === 0,
            ) ? (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                За выбранный период операций нет.
              </p>
            ) : (
              <TableCard>
                <table className="w-full min-w-[28rem] border-collapse">
                  <caption className="sr-only">Разбивка по категориям</caption>
                  <thead>
                    <tr className={TABLE_HEAD_ROW_CLASS}>
                      <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
                        Категория
                      </th>
                      <th
                        scope="col"
                        className={`${TABLE_HEAD_CELL_CLASS} text-right`}
                      >
                        Операций
                      </th>
                      <th
                        scope="col"
                        className={`${TABLE_HEAD_CELL_CLASS} text-right`}
                      >
                        Сумма
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.byCategory
                      .filter((entry) => (entry.count ?? 0) > 0)
                      .map((entry) => (
                        <tr key={entry.category} className={TABLE_ROW_CLASS}>
                          <td className={TABLE_CELL_CLASS}>
                            {entry.label ?? formatCategory(entry.category)}
                          </td>
                          <td className={`${TABLE_CELL_CLASS} text-right`}>
                            {entry.count}
                          </td>
                          <td className={`${TABLE_CELL_CLASS} text-right`}>
                            {formatTyiynAsSom(entry.amountTyiyn)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </TableCard>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export default AccountingSummarySection
