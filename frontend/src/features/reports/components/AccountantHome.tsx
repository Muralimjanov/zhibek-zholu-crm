'use client'

import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatArea } from '@/features/bookings/area'
import {
  ALERT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
} from '@/features/bookings/components/section'
import { canViewContracts } from '@/features/contracts/access'
import { formatDate } from '@/features/contracts/labels'
import {
  formatSignedTyiynAsSom,
  formatTyiynAsSom,
} from '@/features/contracts/money'
import { useContractsQuery } from '@/features/contracts/queries'
import { monthRange } from '@/features/finance/date'
import { useAccountingSummaryQuery } from '@/features/finance/queries'
import { formatEmployeeName, formatPeriod } from '@/features/payroll/labels'
import { usePayrollEntriesQuery } from '@/features/payroll/queries'
import CurrentShiftCard from '@/features/shifts/components/CurrentShiftCard'
import { todayInBishkek } from '@/features/shifts/date'
import { formatGeneratedAt } from '../labels'
import { useReportsQuery } from '../queries'
import { reportTypeLabel } from './ReportView'

const CONTRACTS_ATTENTION_LIMIT = 5

/**
 * Рабочая главная бухгалтера — только из разрешённых ему запросов:
 * `/accounting/summary` за текущий месяц, `/payroll/entries` (черновики,
 * ожидающие подтверждения), `/contracts` (финансовое представление — без
 * ФИО покупателя, отфильтровано на клиенте по уже полученным записям, а не
 * отдельным запросом) и последний financial-отчёт.
 */
export function AccountantHome() {
  const today = todayInBishkek()
  const range = monthRange(today.slice(0, 7))
  const summaryQuery = useAccountingSummaryQuery(
    range?.from ?? '',
    range?.to ?? '',
    range !== null,
  )
  const draftEntriesQuery = usePayrollEntriesQuery({ status: 'draft' }, true)
  const contractsQuery = useContractsQuery(
    { limit: 20, offset: 0 },
    canViewContracts('accountant'),
  )
  const reportsQuery = useReportsQuery(
    { type: 'financial', limit: 1, offset: 0 },
    true,
  )

  const draftEntries = draftEntriesQuery.data ?? []
  const scannedContracts = contractsQuery.data?.items ?? []
  const contractsTotal = contractsQuery.data?.total ?? scannedContracts.length
  const contractsTruncated = contractsTotal > scannedContracts.length
  const attentionContracts = scannedContracts.filter(
    (contract) => !contract.depositPaid || !contract.hasFile,
  )
  const latestReport = reportsQuery.data?.items[0]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Рабочая главная"
        title="Бухгалтер"
        action={
          <Link href="/finance?create=1" className={PRIMARY_BUTTON_CLASS}>
            Новая запись
          </Link>
        }
      />

      <CurrentShiftCard />

      <section
        className={SECTION_CLASS}
        aria-labelledby="month-summary-heading"
      >
        <h2 id="month-summary-heading" className="font-semibold">
          Сводка за текущий месяц
        </h2>
        {summaryQuery.isPending ? (
          <div
            role="status"
            aria-label="Загружаем сводку…"
            className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-3"
          >
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : summaryQuery.isError ? (
          <div className="mt-3 space-y-3">
            <p role="alert" className={ALERT_CLASS}>
              {summaryQuery.error.message}
            </p>
            <button
              className={SECONDARY_BUTTON_CLASS}
              onClick={() => void summaryQuery.refetch()}
            >
              Повторить
            </button>
          </div>
        ) : (
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-caption text-muted">Приход</dt>
              <dd className="tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatTyiynAsSom(summaryQuery.data.incomeTyiyn)}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted">Расход</dt>
              <dd className="tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatTyiynAsSom(summaryQuery.data.expenseTyiyn)}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted">Итог</dt>
              <dd className="tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatSignedTyiynAsSom(summaryQuery.data.netTyiyn)}
              </dd>
            </div>
          </dl>
        )}
        <Link
          href="/finance"
          className="mt-4 inline-block text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
        >
          Вся бухгалтерия
        </Link>
      </section>

      <section
        className={SECTION_CLASS}
        aria-labelledby="pending-payroll-heading"
      >
        <h2 id="pending-payroll-heading" className="font-semibold">
          Начисления, ожидающие подтверждения
        </h2>
        {draftEntriesQuery.isPending ? (
          <div
            role="status"
            aria-label="Загружаем начисления…"
            className="mt-3 space-y-2"
          >
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : draftEntriesQuery.isError ? (
          <div className="mt-3 space-y-3">
            <p role="alert" className={ALERT_CLASS}>
              {draftEntriesQuery.error.message}
            </p>
            <button
              className={SECONDARY_BUTTON_CLASS}
              onClick={() => void draftEntriesQuery.refetch()}
            >
              Повторить
            </button>
          </div>
        ) : draftEntries.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Нет черновиков — все начисления подтверждены.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {draftEntries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <span className="text-zinc-900 dark:text-zinc-50">
                  {formatEmployeeName(entry.employeeFullName)} ·{' '}
                  {formatPeriod(entry.period)}
                </span>
                <span className="tabular-nums text-muted">
                  {formatTyiynAsSom(entry.finalAmountTyiyn)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/payroll"
          className="mt-4 inline-block text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
        >
          Все начисления
        </Link>
      </section>

      <section
        className={SECTION_CLASS}
        aria-labelledby="attention-contracts-heading"
      >
        <h2 id="attention-contracts-heading" className="font-semibold">
          Договоры, требующие взноса или файла
        </h2>
        {contractsQuery.isPending ? (
          <div
            role="status"
            aria-label="Загружаем договоры…"
            className="mt-3 space-y-2"
          >
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : contractsQuery.isError ? (
          <div className="mt-3 space-y-3">
            <p role="alert" className={ALERT_CLASS}>
              {contractsQuery.error.message}
            </p>
            <button
              className={SECONDARY_BUTTON_CLASS}
              onClick={() => void contractsQuery.refetch()}
            >
              Повторить
            </button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-caption text-muted">
              Проверено {scannedContracts.length} из {contractsTotal} договоров
              {contractsTruncated
                ? ' — часть договоров вне этой выборки, откройте «Все договоры» для полного списка'
                : ''}
              .
            </p>
            {attentionContracts.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                Среди проверенных таких договоров нет.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {attentionContracts
                  .slice(0, CONTRACTS_ATTENTION_LIMIT)
                  .map((contract) => (
                    <li key={contract.id} className="py-2">
                      <p className="text-zinc-900 dark:text-zinc-50">
                        {formatArea(contract.areaSqm)} ·{' '}
                        {formatTyiynAsSom(contract.totalAmountTyiyn)}
                      </p>
                      <p className="text-caption text-muted">
                        создан {formatDate(contract.createdAt)} ·{' '}
                        {contract.depositPaid
                          ? 'взнос оплачен'
                          : 'взнос не оплачен'}{' '}
                        · файл {contract.hasFile ? 'есть' : 'не загружен'}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
        <Link
          href="/contracts"
          className="mt-4 inline-block text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
        >
          Все договоры
        </Link>
      </section>

      <section
        className={SECTION_CLASS}
        aria-labelledby="latest-financial-report"
      >
        <h2 id="latest-financial-report" className="font-semibold">
          Свежий финансовый отчёт
        </h2>
        {reportsQuery.isPending ? (
          <div
            role="status"
            aria-label="Загружаем отчёт…"
            className="mt-3 space-y-2"
          >
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : reportsQuery.isError ? (
          <div className="mt-3 space-y-3">
            <p role="alert" className={ALERT_CLASS}>
              {reportsQuery.error.message}
            </p>
            <button
              className={SECONDARY_BUTTON_CLASS}
              onClick={() => void reportsQuery.refetch()}
            >
              Повторить
            </button>
          </div>
        ) : !latestReport ? (
          <p className="mt-3 text-sm text-muted">Отчётов пока нет.</p>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-muted">
              {latestReport.date} · сформирован{' '}
              {formatGeneratedAt(latestReport.generatedAt)}
            </p>
            <Link
              href={`/reports/${encodeURIComponent(latestReport.id)}`}
              className="mt-1 inline-block text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
            >
              {reportTypeLabel(latestReport.type)} · Открыть отчёт
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}

export default AccountantHome
