'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  BookmarkSimpleIcon,
  CalendarXIcon,
  FileTextIcon,
  ScalesIcon,
  UsersThreeIcon,
  WalletIcon,
} from '@phosphor-icons/react/dist/ssr'
import { badgeToneBarClass } from '@/components/ui/Badge'
import { BarChart } from '@/components/ui/charts/BarChart'
import { BalanceDonutChart } from '@/components/ui/charts/BalanceDonutChart'
import { CashFlowAreaChart } from '@/components/ui/charts/CashFlowAreaChart'
import { SalesLineChart } from '@/components/ui/charts/SalesLineChart'
import { SalesRoute } from '@/components/ui/charts/SalesRoute'
import { StatusBarChart } from '@/components/ui/charts/StatusBarChart'
import { KpiCard } from '@/components/ui/KpiCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { canViewBookings } from '@/features/bookings/access'
import { bookingStatusTone } from '@/features/bookings/labels'
import {
  ALERT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
} from '@/features/bookings/components/section'
import { canViewContracts } from '@/features/contracts/access'
import { contractStatusTone } from '@/features/contracts/labels'
import {
  formatSignedTyiynAsSom,
  formatTyiynAsSom,
} from '@/features/contracts/money'
import { transactionTypeTone } from '@/features/finance/labels'
import { canViewShiftsSection } from '@/features/shifts/access'
import { usersNavLabel } from '@/features/users/access'
import type { UserRole } from '@/types/auth'
import { allowedReportTypes } from '../access'
import {
  accountingCategoryBarItems,
  bookingsBarItems,
  cashFlowAreaSeries,
  contractsBarItems,
  dashboardKpis,
  donutBalanceInput,
  salesLineSeries,
  salesRouteStages,
} from '../dashboardCharts'
import {
  bookingStatusLabel,
  contractStatusLabel,
  formatGeneratedAt,
} from '../labels'
import type { Dashboard } from '../parse'
import { useDashboardQuery, useReportsQuery } from '../queries'
import { reportTypeLabel } from './ReportView'

const fmt = {
  money: formatTyiynAsSom,
  signedMoney: formatSignedTyiynAsSom,
  bookingStatusLabel,
  contractStatusLabel,
  bookingStatusTone,
  contractStatusTone,
  transactionTypeTone,
  toneBarClass: badgeToneBarClass,
}

const CATEGORY_PREVIEW_COUNT = 6
const HISTORY_LIMIT = 50

const KPI_ICON: Record<string, typeof WalletIcon> = {
  activeBookedArea: BookmarkSimpleIcon,
  signedContracts: FileTextIcon,
  depositsPaid: WalletIcon,
  netTotal: ScalesIcon,
  payrollConfirmed: UsersThreeIcon,
  missedShifts: CalendarXIcon,
}

/**
 * Форма загрузки повторяет композицию готовой сводки (KPI-ряд, маршрут,
 * панели) на примерную конечную высоту — без этого первичная загрузка
 * заменяла весь экран одним абзацем и после ответа сервера происходил
 * большой layout shift (этап Polish, критерий «без прыжков»). Настоящий
 * `PageHeader` рендерится отдельно, до скелета — не дублируем его бары.
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className={`${SECTION_CLASS} min-h-32 space-y-2`}>
            <Skeleton className="h-6 w-6 rounded-control" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
          </div>
        ))}
      </div>

      <Skeleton className="h-24 w-full" />

      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-[300px] w-full xl:col-span-7" />
        <Skeleton className="h-[300px] w-full xl:col-span-5" />
        <Skeleton className="h-[300px] w-full xl:col-span-7" />
        <Skeleton className="h-[300px] w-full xl:col-span-5" />
      </div>

      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

/**
 * Директор и инвестор (`canViewDashboard`) — единственные роли с реальным
 * корпоративным агрегатом `GET /dashboard`. Быстрые действия — только у
 * директора: у инвестора нет ни одной разрешённой мутации, поэтому ряд
 * действий не рендерится вовсе, а не просто прячет кнопки стилем.
 */
export function CorporateDashboard({ role }: { role: UserRole }) {
  const query = useDashboardQuery(true)
  const hasDashboard = Boolean(query.data)

  // Независимые от live-сводки запросы (см. «Обнови DashboardSkeleton»):
  // падение одного из них не должно скрывать остальной дашборд — каждый
  // несёт свой isPending/isError только в свою карточку графика.
  const salesHistoryQuery = useReportsQuery(
    {
      type: 'sales',
      from: query.data?.from ?? '',
      to: query.data?.to ?? '',
      limit: HISTORY_LIMIT,
      offset: 0,
    },
    hasDashboard,
  )
  const financialHistoryQuery = useReportsQuery(
    {
      type: 'financial',
      from: query.data?.from ?? '',
      to: query.data?.to ?? '',
      limit: HISTORY_LIMIT,
      offset: 0,
    },
    hasDashboard,
  )
  const reportsQuery = useReportsQuery({ limit: 3, offset: 0 }, true)
  const [showAllCategories, setShowAllCategories] = useState(false)

  if (query.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Корпоративная сводка" title="Сводка компании" />
        <div role="status" aria-label="Загружаем сводку…">
          <DashboardSkeleton />
        </div>
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Корпоративная сводка" title="Сводка компании" />
        <div>
          <p role="alert" className={ALERT_CLASS}>
            Не удалось загрузить сводку: {query.error.message}
          </p>
          <button
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => void query.refetch()}
          >
            Повторить
          </button>
        </div>
      </div>
    )
  }

  const d: Dashboard = query.data
  const isDirector = role === 'director'

  const bookingsHref = canViewBookings(role) ? '/bookings' : undefined
  const contractsHref = canViewContracts(role) ? '/contracts' : undefined
  const shiftsHref = canViewShiftsSection(role) ? '/shifts' : undefined
  const reportsHref =
    allowedReportTypes(role).length > 0 ? '/reports' : undefined
  const usersLabel = usersNavLabel(role)

  const kpis = dashboardKpis(d, fmt)
  const categoryItems = accountingCategoryBarItems(d.accounting.byCategory, fmt)
  const visibleCategoryItems = showAllCategories
    ? categoryItems
    : categoryItems.slice(0, CATEGORY_PREVIEW_COUNT)

  const salesSeries = salesLineSeries(salesHistoryQuery.data?.items ?? [])
  const cashFlowSeries = cashFlowAreaSeries(
    financialHistoryQuery.data?.items ?? [],
  )
  const salesHistoryTotal = salesHistoryQuery.data?.total ?? 0
  const financialHistoryTotal = financialHistoryQuery.data?.total ?? 0

  const donut = donutBalanceInput(d.accounting, fmt)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Корпоративная сводка"
        title="Сводка компании"
        description={`${d.from} — ${d.to} · текущие данные, обновляются сразу — в отличие от сохранённых ежедневных отчётов в архиве`}
        action={
          isDirector && bookingsHref ? (
            <Link
              href={`${bookingsHref}?create=1`}
              className={PRIMARY_BUTTON_CLASS}
            >
              Новая бронь
            </Link>
          ) : undefined
        }
      />

      {isDirector ? (
        <div className="flex flex-wrap gap-2.5">
          {contractsHref ? (
            <Link
              href={`${contractsHref}?create=1`}
              className={SECONDARY_BUTTON_CLASS}
            >
              Новый договор
            </Link>
          ) : null}
          {usersLabel ? (
            <Link href="/users" className={SECONDARY_BUTTON_CLASS}>
              {usersLabel}
            </Link>
          ) : null}
          {reportsHref ? (
            <Link href={reportsHref} className={SECONDARY_BUTTON_CLASS}>
              Отчёты
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            compactValue={kpi.compactValue}
            context={kpi.context}
            href={kpi.key === 'missedShifts' ? shiftsHref : undefined}
            icon={KPI_ICON[kpi.key]}
          />
        ))}
      </div>

      <section aria-labelledby="sales-route-heading">
        <h2
          id="sales-route-heading"
          className="text-section-title font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Маршрут продаж
        </h2>
        <p className="mt-1 text-caption text-muted">
          Этапы показывают отдельные итоги за период, а не конверсию одной
          группы сделок.
        </p>
        <div className="mt-3">
          <SalesRoute
            stages={salesRouteStages(d, fmt, {
              bookings: bookingsHref,
              contracts: contractsHref,
            })}
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
        <div className="min-w-0 xl:col-span-7">
          <SalesLineChart
            data={salesSeries}
            isPending={salesHistoryQuery.isPending}
            isError={salesHistoryQuery.isError}
            errorMessage={salesHistoryQuery.error?.message}
            onRetry={() => void salesHistoryQuery.refetch()}
            shown={salesSeries.length}
            total={salesHistoryTotal}
          />
        </div>

        <div className="min-w-0 xl:col-span-5">
          <BalanceDonutChart
            netLabel={donut.netLabel}
            netCompactLabel={donut.netCompactLabel}
            incomeApprox={donut.incomeApprox}
            expenseApprox={donut.expenseApprox}
            incomeDisplay={donut.incomeDisplay}
            expenseDisplay={donut.expenseDisplay}
          />
        </div>

        <div className="min-w-0 xl:col-span-7">
          <CashFlowAreaChart
            data={cashFlowSeries}
            isPending={financialHistoryQuery.isPending}
            isError={financialHistoryQuery.isError}
            errorMessage={financialHistoryQuery.error?.message}
            onRetry={() => void financialHistoryQuery.refetch()}
            shown={cashFlowSeries.length}
            total={financialHistoryTotal}
          />
        </div>

        <div className="min-w-0 xl:col-span-5">
          <StatusBarChart
            bookingsItems={bookingsBarItems(d.bookings, fmt)}
            contractsItems={contractsBarItems(d.contracts, fmt)}
          />
        </div>
      </div>

      <section className={SECTION_CLASS}>
        <h3 className="font-semibold">Финансовые категории</h3>
        {categoryItems.length > 0 ? (
          <div className="mt-3">
            <BarChart items={visibleCategoryItems} />
            {categoryItems.length > CATEGORY_PREVIEW_COUNT ? (
              <button
                type="button"
                onClick={() => {
                  setShowAllCategories((value) => !value)
                }}
                className="mt-3 cursor-pointer text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
              >
                {showAllCategories
                  ? 'Свернуть категории'
                  : `Все категории (${categoryItems.length})`}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">За период операций нет.</p>
        )}
      </section>

      {reportsHref ? (
        <section
          className={SECTION_CLASS}
          aria-labelledby="recent-reports-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="recent-reports-heading" className="font-semibold">
              Последние ежедневные отчёты
            </h3>
            {/* На телефоне ссылка-действие должна нажиматься пальцем: 44px
                по высоте — минимум из дизайн-контракта. */}
            <Link
              href="/reports"
              className="-my-2 inline-flex min-h-11 items-center py-2 text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
            >
              Все отчёты
            </Link>
          </div>
          <div className="mt-3">
            {reportsQuery.isPending ? (
              <div
                role="status"
                aria-label="Загружаем отчёты…"
                className="space-y-3 divide-y divide-zinc-200 dark:divide-zinc-800"
              >
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="space-y-1.5 py-2.5 first:pt-0">
                    <Skeleton className="h-4 w-48 max-w-full" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </div>
            ) : reportsQuery.isError ? (
              <div className="space-y-3">
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
            ) : reportsQuery.data.items.length === 0 ? (
              <p className="text-sm text-muted">Отчётов пока нет.</p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {reportsQuery.data.items.map((report) => (
                  <li key={report.id} className="py-2.5">
                    <Link
                      href={`/reports/${encodeURIComponent(report.id)}`}
                      className="inline-flex min-h-11 items-center font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
                    >
                      {reportTypeLabel(report.type)} · {report.date}
                    </Link>
                    <p className="text-caption text-muted">
                      Сформирован: {formatGeneratedAt(report.generatedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default CorporateDashboard
