'use client'

import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { canViewBookings } from '@/features/bookings/access'
import {
  ALERT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
} from '@/features/bookings/components/section'
import { canViewContracts } from '@/features/contracts/access'
import CurrentShiftCard from '@/features/shifts/components/CurrentShiftCard'
import { usersNavLabel } from '@/features/users/access'
import type { UserRole } from '@/types/auth'
import { formatGeneratedAt } from '../labels'
import type { SalesData } from '../parse'
import { useReportsQuery } from '../queries'
import SalesAnalytics from './SalesAnalytics'

/**
 * Рабочая главная начальника отдела продаж — только из разрешённых ему
 * запросов: `/analytics/sales` (переиспользуем готовый `SalesAnalytics`,
 * там же — рейтинг команды и её посещаемость), собственная смена и
 * последний sales-отчёт. Список «не открыли смену» берём из ЭТОГО отчёта
 * (снимок на момент его формирования), а не выдаём за live-статус.
 */
export function HeadOfSalesHome({ role }: { role: UserRole }) {
  const reportsQuery = useReportsQuery(
    { type: 'sales', limit: 1, offset: 0 },
    true,
  )
  const usersLabel = usersNavLabel(role)
  const latest = reportsQuery.data?.items[0]
  const notOpened =
    latest && latest.type === 'sales'
      ? (latest.data as SalesData).attendance.notOpened
      : []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Рабочая главная"
        title="Начальник отдела продаж"
        action={
          canViewBookings(role) ? (
            <Link href="/bookings?create=1" className={PRIMARY_BUTTON_CLASS}>
              Новая бронь
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2.5">
        {canViewContracts(role) ? (
          <Link href="/contracts?create=1" className={SECONDARY_BUTTON_CLASS}>
            Новый договор
          </Link>
        ) : null}
        {usersLabel ? (
          <Link href="/users" className={SECONDARY_BUTTON_CLASS}>
            {usersLabel}
          </Link>
        ) : null}
      </div>

      <CurrentShiftCard />

      <SalesAnalytics />

      <section className={SECTION_CLASS} aria-labelledby="latest-sales-report">
        <h2 id="latest-sales-report" className="font-semibold">
          Свежий отчёт по продажам
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
        ) : !latest ? (
          <p className="mt-3 text-sm text-muted">Отчётов пока нет.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-muted">
              {latest.date} · сформирован{' '}
              {formatGeneratedAt(latest.generatedAt)}
            </p>
            <Link
              href={`/reports/${encodeURIComponent(latest.id)}`}
              className="inline-block text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
            >
              Открыть отчёт
            </Link>
            {notOpened.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  Не открыли смену (на момент отчёта {latest.date})
                </p>
                <ul className="mt-1 list-inside list-disc text-sm text-muted">
                  {notOpened.map((employee) => (
                    <li key={employee.userId}>{employee.fullName}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}

export default HeadOfSalesHome
