'use client'

import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  ALERT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
} from '@/features/bookings/components/section'
import { formatTyiynAsSom } from '@/features/contracts/money'
import {
  formatPayrollEntryStatus,
  formatPeriod,
  payrollEntryStatusTone,
} from '@/features/payroll/labels'
import { usePayrollEntriesQuery } from '@/features/payroll/queries'
import CurrentShiftCard from '@/features/shifts/components/CurrentShiftCard'

/**
 * Рабочая главная менеджера по продажам. Списки броней/договоров сервер уже
 * скрывает до «своих» для этой роли (`GET /bookings`, `GET /contracts`) —
 * дашборд не делает для этого отдельный запрос, только ссылки на разделы.
 * Зарплата — `GET /payroll/entries`, тоже уже ограничена сервером до
 * собственных записей (`canViewOwnPayroll`); последняя по периоду выбирается
 * на клиенте сортировкой уже полученных записей, без отдельного запроса.
 */
export function SalesManagerHome() {
  const payrollQuery = usePayrollEntriesQuery({}, true)
  const entries = payrollQuery.data ?? []
  const latest = entries
    .slice()
    .sort((a, b) => (b.period ?? '').localeCompare(a.period ?? ''))[0]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Рабочая главная"
        title="Менеджер по продажам"
        action={
          <Link href="/bookings?create=1" className={PRIMARY_BUTTON_CLASS}>
            Новая бронь
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2.5">
        <Link href="/bookings" className={SECONDARY_BUTTON_CLASS}>
          Мои брони
        </Link>
        <Link href="/contracts" className={SECONDARY_BUTTON_CLASS}>
          Мои договоры
        </Link>
      </div>

      <CurrentShiftCard />

      <section className={SECTION_CLASS} aria-labelledby="my-payroll-heading">
        <h2 id="my-payroll-heading" className="font-semibold">
          Моя зарплата
        </h2>
        {payrollQuery.isPending ? (
          <div
            role="status"
            aria-label="Загружаем начисления…"
            className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-3"
          >
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : payrollQuery.isError ? (
          <div className="mt-3 space-y-3">
            <p role="alert" className={ALERT_CLASS}>
              {payrollQuery.error.message}
            </p>
            <button
              className={SECONDARY_BUTTON_CLASS}
              onClick={() => void payrollQuery.refetch()}
            >
              Повторить
            </button>
          </div>
        ) : !latest ? (
          <p className="mt-3 text-sm text-muted">Начислений пока нет.</p>
        ) : (
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-caption text-muted">Период</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">
                {formatPeriod(latest.period)}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted">Статус</dt>
              <dd>
                <Badge tone={payrollEntryStatusTone(latest.status)}>
                  {formatPayrollEntryStatus(latest.status)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted">К выплате</dt>
              <dd className="tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatTyiynAsSom(latest.finalAmountTyiyn)}
              </dd>
            </div>
          </dl>
        )}
        <Link
          href="/payroll"
          className="mt-4 inline-block text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
        >
          Все начисления
        </Link>
      </section>
    </div>
  )
}

export default SalesManagerHome
