'use client'

import { useId, useState } from 'react'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import FilterBar from '@/components/ui/FilterBar'
import {
  FilterSummary,
  type ActiveFilterChip,
} from '@/components/ui/FilterSummary'
import TableSkeleton from '@/components/ui/TableSkeleton'
import { describeApiError } from '@/features/auth/error-messages'
import {
  ERROR_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import { useUsersQuery } from '@/features/users/queries'
import type { ShiftStatus } from '@/types/shift'
import { describeShiftError } from '../errors'
import { formatShiftStatus } from '../labels'
import { useShiftsQuery } from '../queries'
import ShiftsHistoryTable from './ShiftsHistoryTable'

const PAGE_SIZE = 20

export function ShiftsHistorySection({
  showEmployee,
}: {
  showEmployee: boolean
}) {
  const statusId = useId()
  const employeeId = useId()
  const [status, setStatus] = useState<ShiftStatus | ''>('')
  const [userId, setUserId] = useState('')
  const [offset, setOffset] = useState(0)

  const usersQuery = useUsersQuery(showEmployee)

  const query = useShiftsQuery(
    {
      status: status === '' ? undefined : status,
      userId: userId === '' ? undefined : userId,
      limit: PAGE_SIZE,
      offset,
    },
    true,
  )

  const total = query.data?.total ?? 0
  const shownFrom = total === 0 ? 0 : offset + 1
  const shownTo = Math.min(offset + (query.data?.items.length ?? 0), total)

  const selectedEmployee = usersQuery.data?.find((item) => item.id === userId)
  const hasAnyFilter = Boolean(status || userId)

  const resetAllFilters = () => {
    setStatus('')
    setUserId('')
    setOffset(0)
  }

  const chips: ActiveFilterChip[] = []

  if (status) {
    chips.push({
      key: 'status',
      label: `Статус: ${formatShiftStatus(status)}`,
      onRemove: () => {
        setStatus('')
        setOffset(0)
      },
    })
  }

  if (userId) {
    chips.push({
      key: 'employee',
      label: `Сотрудник: ${selectedEmployee?.fullName ?? '—'}`,
      onRemove: () => {
        setUserId('')
        setOffset(0)
      },
    })
  }

  return (
    <section className={SECTION_CLASS} aria-labelledby="shifts-history-heading">
      <h2 id="shifts-history-heading" className={SECTION_TITLE_CLASS}>
        История смен
      </h2>

      <div className="mt-4">
        <FilterBar>
          <div className="flex flex-wrap items-end gap-3">
            <div className="max-w-xs space-y-1.5">
              <label htmlFor={statusId} className={LABEL_CLASS}>
                Статус
              </label>
              <select
                id={statusId}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as ShiftStatus | '')
                  // Смена фильтра всегда возвращает на первую страницу.
                  setOffset(0)
                }}
                className={FIELD_CLASS}
              >
                <option value="">Любой</option>
                <option value="open">Открыта</option>
                <option value="closed">Закрыта</option>
                <option value="missed">Прогул</option>
              </select>
            </div>

            {showEmployee ? (
              <div className="max-w-xs space-y-1.5">
                <label htmlFor={employeeId} className={LABEL_CLASS}>
                  Сотрудник
                </label>
                <select
                  id={employeeId}
                  value={userId}
                  disabled={usersQuery.isPending || usersQuery.isError}
                  onChange={(event) => {
                    setUserId(event.target.value)
                    setOffset(0)
                  }}
                  className={FIELD_CLASS}
                >
                  <option value="">Все сотрудники</option>
                  {(usersQuery.data ?? []).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.fullName}
                    </option>
                  ))}
                </select>
                {usersQuery.isError ? (
                  <p className={ERROR_CLASS}>
                    {describeApiError(usersQuery.error)}{' '}
                    <button
                      type="button"
                      onClick={() => void usersQuery.refetch()}
                      className="cursor-pointer font-medium underline underline-offset-4"
                    >
                      Повторить
                    </button>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </FilterBar>
      </div>

      <div className="mt-4">
        {query.isPending ? (
          <TableSkeleton
            caption="Загружаем историю смен"
            columns={
              showEmployee
                ? ['Сотрудник', 'Дата', 'Статус', 'Открыта', 'Закрыта']
                : ['Дата', 'Статус', 'Открыта', 'Закрыта']
            }
            minWidthClassName="min-w-[40rem]"
          />
        ) : query.isError ? (
          <ErrorState
            message={describeShiftError(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <FilterSummary
              resultsText={`Показаны ${shownFrom}–${shownTo} из ${total}`}
              chips={chips}
            />

            {!query.data || query.data.items.length === 0 ? (
              <EmptyState
                title="Смен по этим условиям нет"
                description={
                  hasAnyFilter
                    ? 'Попробуйте другой статус, сотрудника или сбросьте фильтры.'
                    : 'Смены появятся здесь после первого открытия.'
                }
                action={
                  hasAnyFilter ? (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className={SECONDARY_BUTTON_CLASS}
                    >
                      Сбросить фильтры
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="mt-3 space-y-4">
                <ShiftsHistoryTable
                  items={query.data.items}
                  showEmployee={showEmployee}
                />
                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  <button
                    type="button"
                    disabled={offset === 0 || query.isFetching}
                    onClick={() => {
                      setOffset((value) => Math.max(0, value - PAGE_SIZE))
                    }}
                    className={SECONDARY_BUTTON_CLASS}
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    disabled={shownTo >= total || query.isFetching}
                    onClick={() => {
                      setOffset((value) => value + PAGE_SIZE)
                    }}
                    className={SECONDARY_BUTTON_CLASS}
                  >
                    Вперёд
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default ShiftsHistorySection
