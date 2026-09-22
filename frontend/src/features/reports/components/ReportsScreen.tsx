'use client'
import { useState } from 'react'
import Link from 'next/link'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import FilterBar from '@/components/ui/FilterBar'
import {
  FilterSummary,
  type ActiveFilterChip,
} from '@/components/ui/FilterSummary'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useSession } from '@/features/auth/useSession'
import NoAccess from '@/features/bookings/components/NoAccess'
import {
  ALERT_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
} from '@/features/bookings/components/section'
import { allowedReportTypes, type ReportType } from '../access'
import type { ReportFilters } from '../filters'
import { formatGeneratedAt } from '../labels'
import { useReportsQuery } from '../queries'
import PayrollSummarySection from './PayrollSummarySection'
import SalesAnalytics from './SalesAnalytics'
import { reportTypeLabel } from './ReportView'
const PAGE_SIZE = 20
export default function ReportsScreen() {
  const { user } = useSession()
  const types = allowedReportTypes(user?.role)
  const [type, setType] = useState<ReportType | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [applied, setApplied] = useState<ReportFilters>({
    limit: PAGE_SIZE,
    offset: 0,
  })
  const [filterError, setFilterError] = useState('')
  const q = useReportsQuery(applied, types.length > 0)
  if (!user) return null
  if (types.length === 0)
    return <NoAccess reason="Ежедневные отчёты недоступны вашей роли." />

  const resetFilters = () => {
    setType('')
    setFrom('')
    setTo('')
    setFilterError('')
    setApplied({ limit: PAGE_SIZE, offset: 0 })
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (from && to && from > to) {
      setFilterError('Начало периода позже окончания.')
      return
    }
    setFilterError('')
    setApplied({
      type: types.length > 1 && type ? type : undefined,
      from: from || undefined,
      to: to || undefined,
      limit: PAGE_SIZE,
      offset: 0,
    })
  }

  const hasAnyFilter = Boolean(applied.type ?? applied.from ?? applied.to)
  const chips: ActiveFilterChip[] = []

  if (applied.type) {
    chips.push({
      key: 'type',
      label: `Тип: ${reportTypeLabel(applied.type)}`,
      onRemove: () => {
        setType('')
        setApplied((prev) => ({ ...prev, type: undefined, offset: 0 }))
      },
    })
  }

  if (applied.from ?? applied.to) {
    chips.push({
      key: 'date',
      label: `Период: ${applied.from ?? '…'} — ${applied.to ?? '…'}`,
      onRemove: () => {
        setFrom('')
        setTo('')
        setApplied((prev) => ({
          ...prev,
          from: undefined,
          to: undefined,
          offset: 0,
        }))
      },
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Аналитика"
        title="Отчёты"
        description="Архив хранит данные на момент последнего формирования. Новые брони, договоры и операции сами по себе не меняют отчёт; при повторном закрытии смены за тот же день сервер обновит его. Актуальные показатели смотрите в сводке, аналитике или бухгалтерии."
      />

      <SalesAnalytics />

      {/* Зарплата в отчётности — только директору (решение владельца 22.09.2026). */}
      {user.role === 'director' ? <PayrollSummarySection /> : null}

      <section className={SECTION_CLASS}>
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          Ежедневные отчёты
        </h2>

        <div className="mt-4">
          <FilterBar>
            <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
              {types.length > 1 ? (
                <label className={LABEL_CLASS}>
                  Тип
                  <select
                    className={FIELD_CLASS}
                    value={type}
                    onChange={(e) => setType(e.target.value as ReportType | '')}
                  >
                    <option value="">Все</option>
                    {types.map((t) => (
                      <option key={t} value={t}>
                        {reportTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className={LABEL_CLASS}>
                С
                <input
                  className={FIELD_CLASS}
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className={LABEL_CLASS}>
                По
                <input
                  className={FIELD_CLASS}
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <button className={SECONDARY_BUTTON_CLASS}>Применить</button>
              <button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={resetFilters}
              >
                Сбросить
              </button>
            </form>
          </FilterBar>
          {filterError ? (
            <p role="alert" className={`mt-3 ${ALERT_CLASS}`}>
              {filterError}
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          {q.isPending ? (
            <div
              role="status"
              aria-label="Загружаем отчёты…"
              className="divide-y divide-zinc-200 dark:divide-zinc-800"
            >
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-1.5 py-3 first:pt-0">
                  <Skeleton className="h-4 w-56 max-w-full" />
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-full max-w-md" />
                </div>
              ))}
            </div>
          ) : q.isError ? (
            <ErrorState
              message={q.error.message}
              onRetry={() => void q.refetch()}
            />
          ) : (
            <>
              <FilterSummary
                resultsText={`Показаны ${q.data.total ? applied.offset + 1 : 0}–${Math.min(applied.offset + q.data.items.length, q.data.total)} из ${q.data.total}`}
                chips={chips}
              />
              {q.data.items.length === 0 ? (
                <EmptyState
                  title="За выбранный период отчётов нет"
                  description={
                    hasAnyFilter
                      ? 'Попробуйте другой период или тип отчёта.'
                      : 'Отчёты появятся здесь после первого формирования.'
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
                    ) : undefined
                  }
                />
              ) : (
                <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
                  {q.data.items.map((report) => (
                    <li key={report.id} className="py-3">
                      <Link
                        href={`/reports/${encodeURIComponent(report.id)}`}
                        className="font-medium text-brand-700 underline dark:text-brand-300"
                      >
                        {reportTypeLabel(report.type)} · {report.date}
                      </Link>
                      <p className="text-caption text-muted">
                        Сформирован: {formatGeneratedAt(report.generatedAt)}
                      </p>
                      <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted">
                        {report.summary}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {q.data.items.length > 0 ? (
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className={SECONDARY_BUTTON_CLASS}
                    disabled={applied.offset === 0 || q.isFetching}
                    onClick={() =>
                      setApplied({
                        ...applied,
                        offset: Math.max(0, applied.offset - PAGE_SIZE),
                      })
                    }
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    className={SECONDARY_BUTTON_CLASS}
                    disabled={
                      applied.offset + PAGE_SIZE >= q.data.total || q.isFetching
                    }
                    onClick={() =>
                      setApplied({
                        ...applied,
                        offset: applied.offset + PAGE_SIZE,
                      })
                    }
                  >
                    Вперёд
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
