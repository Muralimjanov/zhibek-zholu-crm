'use client'

import { useMemo, useState } from 'react'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import FilterBar from '@/components/ui/FilterBar'
import {
  FilterSummary,
  type ActiveFilterChip,
} from '@/components/ui/FilterSummary'
import { PageHeader } from '@/components/ui/PageHeader'
import TableSkeleton from '@/components/ui/TableSkeleton'
import { useSession } from '@/features/auth/useSession'
import NoAccess from '@/features/bookings/components/NoAccess'
import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import { useCreateFlagFromQuery } from '@/hooks/useCreateFlagFromQuery'
import type {
  TransactionCategory,
  TransactionListQuery,
  TransactionType,
} from '@/types/finance'
import { canManageFinance, canViewFinanceSection } from '../access'
import { describeFinanceError } from '../errors'
import { formatCategory, formatTransactionType } from '../labels'
import { useTransactionsQuery } from '../queries'
import AccountingSummarySection from './AccountingSummarySection'
import CreateTransactionForm from './CreateTransactionForm'
import TransactionCard from './TransactionCard'
import TransactionsFilters from './TransactionsFilters'
import TransactionsTable from './TransactionsTable'

const PAGE_SIZE = 20

interface AppliedFilters {
  from?: string
  to?: string
  type?: TransactionType
  category?: TransactionCategory
}

export function FinanceScreen() {
  const { user } = useSession()

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState<TransactionType | ''>('')
  const [category, setCategory] = useState('')
  const [applied, setApplied] = useState<AppliedFilters>({})
  const [offset, setOffset] = useState(0)
  const [creating, setCreating] = useCreateFlagFromQuery()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const canView = canViewFinanceSection(user?.role)
  const canManage = canManageFinance(user?.role)

  const query = useMemo<TransactionListQuery>(
    () => ({ ...applied, limit: PAGE_SIZE, offset }),
    [applied, offset],
  )

  const { data, isPending, isError, error, refetch, isFetching } =
    useTransactionsQuery(query, canView)

  if (!user) {
    return null
  }

  if (!canView) {
    return (
      <NoAccess reason="Бухгалтерия доступна директору (просмотр) и бухгалтеру (полный доступ). Если доступ нужен по работе, обратитесь к руководителю." />
    )
  }

  const applyFilters = () => {
    setApplied({
      from: from || undefined,
      to: to || undefined,
      type: type || undefined,
      category: (category || undefined) as TransactionCategory | undefined,
    })
    setOffset(0)
  }

  const resetFilters = () => {
    setFrom('')
    setTo('')
    setType('')
    setCategory('')
    setApplied({})
    setOffset(0)
  }

  const removeDateFilter = () => {
    setFrom('')
    setTo('')
    setApplied((prev) => ({ ...prev, from: undefined, to: undefined }))
    setOffset(0)
  }

  const removeTypeFilter = () => {
    setType('')
    setCategory('')
    setApplied((prev) => ({
      ...prev,
      type: undefined,
      category: undefined,
    }))
    setOffset(0)
  }

  const removeCategoryFilter = () => {
    setCategory('')
    setApplied((prev) => ({ ...prev, category: undefined }))
    setOffset(0)
  }

  const total = data?.total ?? 0
  const shownFrom = total === 0 ? 0 : offset + 1
  const shownTo = Math.min(offset + (data?.items.length ?? 0), total)

  const hasAnyFilter = Boolean(
    applied.from ?? applied.to ?? applied.type ?? applied.category,
  )

  const chips: ActiveFilterChip[] = []

  if (applied.from ?? applied.to) {
    chips.push({
      key: 'date',
      label: `Период: ${applied.from ?? '…'} — ${applied.to ?? '…'}`,
      onRemove: removeDateFilter,
    })
  }

  if (applied.type) {
    chips.push({
      key: 'type',
      label: `Тип: ${formatTransactionType(applied.type)}`,
      onRemove: removeTypeFilter,
    })
  }

  if (applied.category) {
    chips.push({
      key: 'category',
      label: `Категория: ${formatCategory(applied.category)}`,
      onRemove: removeCategoryFilter,
    })
  }

  if (creating && canManage) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader
          eyebrow="Финансы"
          title="Новая запись"
          description="Тип, категория, сумма и дата операции."
          action={
            <button
              type="button"
              onClick={() => setCreating(false)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Отмена
            </button>
          }
        />
        <CreateTransactionForm
          onDone={() => {
            setCreating(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Финансы"
        title="Бухгалтерия"
        description="Сводка, приходы и расходы."
        action={
          canManage ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={PRIMARY_BUTTON_CLASS}
            >
              Новая запись
            </button>
          ) : undefined
        }
      />

      <AccountingSummarySection />

      <section className={SECTION_CLASS} aria-labelledby="finance-heading">
        <h2 id="finance-heading" className={SECTION_TITLE_CLASS}>
          Приходы и расходы
        </h2>

        <div className="mt-4">
          <FilterBar>
            <TransactionsFilters
              from={from}
              to={to}
              type={type}
              category={category}
              onFromChange={setFrom}
              onToChange={setTo}
              onTypeChange={(value) => {
                setType(value)
                setCategory('')
              }}
              onCategoryChange={setCategory}
              onSubmit={applyFilters}
              onReset={resetFilters}
              disabled={isPending && !data}
            />
          </FilterBar>
        </div>

        <div className="mt-4">
          {isPending && !data ? (
            <TableSkeleton
              caption="Загружаем операции"
              columns={['Дата', 'Тип', 'Категория', 'Сумма', 'Файл', '']}
              minWidthClassName="min-w-[36rem]"
            />
          ) : isError ? (
            <ErrorState
              message={describeFinanceError(error)}
              onRetry={() => void refetch()}
            />
          ) : (
            <>
              <FilterSummary
                resultsText={
                  <span className="inline-flex items-center gap-3">
                    <span>
                      {isFetching
                        ? 'Обновляем…'
                        : `Показаны ${shownFrom}–${shownTo} из ${total}`}
                    </span>
                    <button
                      type="button"
                      disabled={isFetching}
                      onClick={() => void refetch()}
                      className="cursor-pointer font-medium text-brand-700 underline underline-offset-4 disabled:opacity-60 dark:text-brand-300"
                    >
                      Обновить
                    </button>
                  </span>
                }
                chips={chips}
              />

              {!data || data.items.length === 0 ? (
                <EmptyState
                  title={
                    hasAnyFilter
                      ? 'По этим условиям ничего не найдено'
                      : 'Операций пока нет'
                  }
                  description={
                    hasAnyFilter
                      ? 'Попробуйте другой период, тип или категорию.'
                      : canManage
                        ? 'Создайте первую запись кнопкой «Новая запись».'
                        : undefined
                  }
                  action={
                    hasAnyFilter ? (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className={SECONDARY_BUTTON_CLASS}
                      >
                        Сбросить фильтры
                      </button>
                    ) : canManage ? (
                      <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className={PRIMARY_BUTTON_CLASS}
                      >
                        Новая запись
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <div className="mt-3">
                    <TransactionsTable
                      items={data.items}
                      selectedId={selectedId}
                      onSelect={(id) => {
                        setSelectedId(id === selectedId ? null : id)
                      }}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5">
                    <button
                      type="button"
                      disabled={offset === 0 || isFetching}
                      onClick={() => {
                        setOffset((value) => Math.max(0, value - PAGE_SIZE))
                      }}
                      className={SECONDARY_BUTTON_CLASS}
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      disabled={shownTo >= total || isFetching}
                      onClick={() => {
                        setOffset((value) => value + PAGE_SIZE)
                      }}
                      className={SECONDARY_BUTTON_CLASS}
                    >
                      Вперёд
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {selectedId ? (
          <div className="mt-4">
            {/* `key={selectedId}` — при переключении карточек сбрасывает
                несохранённые поля и введённый код, а не переиспользует
                инстанс (см. `payroll/PayrollEntriesSection.tsx`). */}
            <TransactionCard
              key={selectedId}
              transactionId={selectedId}
              onClose={() => {
                setSelectedId(null)
              }}
            />
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default FinanceScreen
