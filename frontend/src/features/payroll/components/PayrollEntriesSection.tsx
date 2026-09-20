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
import {
  FIELD_CLASS,
  LABEL_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import type { PayrollEntryStatus } from '@/types/payroll'
import { currentPeriodInBishkek } from '../date'
import { describePayrollError } from '../errors'
import { formatPayrollEntryStatus, formatPeriod } from '../labels'
import { usePayrollEntriesQuery } from '../queries'
import GeneratePayrollEntriesForm from './GeneratePayrollEntriesForm'
import PayrollEntriesTable from './PayrollEntriesTable'
import PayrollEntryDetail from './PayrollEntryDetail'

/**
 * Список начислений с фильтром по месяцу и статусу. Для `canManage`
 * (бухгалтер) дополнительно показывает генерацию месяца. Кого именно вернёт
 * `GET /payroll/entries` без параметра `userId` — решает сервер
 * (`CLAUDE_PAYROLL_TASK.md`: «Сервер решает, чьи записи доступны») — здесь
 * просто отображается пришедший список, без предположений о его составе.
 *
 * `heading` передаёт вызывающий экран: для директора это «Начисления» (он
 * видит весь список на чтение, подтверждено живьём — см. `access.ts`), для
 * сотрудника с собственной зарплатой — «Моя зарплата», иначе не совпадало
 * бы с тем, что реально показывает список.
 */
export function PayrollEntriesSection({
  canManage,
  heading,
}: {
  canManage: boolean
  heading: string
}) {
  const periodId = useId()
  const statusId = useId()
  const [period, setPeriod] = useState(currentPeriodInBishkek())
  const [status, setStatus] = useState<PayrollEntryStatus | ''>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const query = usePayrollEntriesQuery(
    { period: period || undefined, status: status || undefined },
    true,
  )

  const hasAnyFilter = period !== '' || status !== ''
  const chips: ActiveFilterChip[] = []

  if (period) {
    chips.push({
      key: 'period',
      label: `Период: ${formatPeriod(period)}`,
      onRemove: () => {
        setPeriod('')
      },
    })
  }

  if (status) {
    chips.push({
      key: 'status',
      label: `Статус: ${formatPayrollEntryStatus(status)}`,
      onRemove: () => {
        setStatus('')
      },
    })
  }

  return (
    <section
      className={SECTION_CLASS}
      aria-labelledby="payroll-entries-heading"
    >
      <h2 id="payroll-entries-heading" className={SECTION_TITLE_CLASS}>
        {heading}
      </h2>

      {canManage ? (
        <div className="mt-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <GeneratePayrollEntriesForm />
        </div>
      ) : null}

      <div className="mt-4">
        <FilterBar>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor={periodId} className={LABEL_CLASS}>
                Период, ГГГГ-ММ
              </label>
              <input
                id={periodId}
                className={FIELD_CLASS}
                placeholder="2026-09"
                value={period}
                onChange={(event) => {
                  setPeriod(event.target.value)
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={statusId} className={LABEL_CLASS}>
                Статус
              </label>
              <select
                id={statusId}
                className={FIELD_CLASS}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as PayrollEntryStatus | '')
                }}
              >
                <option value="">Все</option>
                <option value="draft">Черновик</option>
                <option value="confirmed">Подтверждено</option>
              </select>
            </div>
            {period !== '' ? (
              <button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={() => {
                  setPeriod('')
                }}
              >
                Показать все периоды
              </button>
            ) : null}
          </div>
        </FilterBar>
      </div>

      <div className="mt-4">
        {query.isPending ? (
          <TableSkeleton
            caption="Загружаем начисления"
            columns={['Сотрудник', 'Период', 'Статус', 'К выплате', '']}
            minWidthClassName="min-w-[36rem]"
          />
        ) : query.isError ? (
          <ErrorState
            message={describePayrollError(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <FilterSummary
              resultsText={`Показано начислений: ${query.data.length}`}
              chips={chips}
            />
            {query.data.length === 0 ? (
              <EmptyState
                title="Начислений по выбранным фильтрам нет"
                description="Попробуйте другой период или статус."
                action={
                  hasAnyFilter ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPeriod('')
                        setStatus('')
                      }}
                      className={SECONDARY_BUTTON_CLASS}
                    >
                      Сбросить фильтры
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="mt-3">
                <PayrollEntriesTable
                  items={query.data}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id === selectedId ? null : id)
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {selectedId ? (
        <div className="mt-4">
          {/*
            `key={selectedId}` — при переключении на другую запись карточка
            размонтируется и монтируется заново, а не переиспользует
            инстанс: без этого локальное состояние (несохранённый ввод
            коррекции, запрошенный код, диалог подтверждения) осталось бы от
            прежней записи и могло бы относиться уже к другой.
          */}
          <PayrollEntryDetail
            key={selectedId}
            entryId={selectedId}
            canManage={canManage}
            onClose={() => {
              setSelectedId(null)
            }}
          />
        </div>
      ) : null}
    </section>
  )
}

export default PayrollEntriesSection
