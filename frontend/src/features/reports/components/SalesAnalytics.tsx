'use client'
import { badgeToneBarClass } from '@/components/ui/Badge'
import { BarChart } from '@/components/ui/charts/BarChart'
import { Skeleton } from '@/components/ui/Skeleton'
import { useSession } from '@/features/auth/useSession'
import {
  ALERT_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
} from '@/features/bookings/components/section'
import { formatTyiynAsSom } from '@/features/contracts/money'
import { canViewSalesAnalytics } from '../access'
import { useSalesAnalyticsQuery } from '../queries'
import { Metric } from './ReportView'
export default function SalesAnalytics() {
  const { user } = useSession()
  const allowed = canViewSalesAnalytics(user?.role)
  const q = useSalesAnalyticsQuery(allowed)
  if (!allowed) return null
  return (
    <section className={SECTION_CLASS}>
      <h2 className="text-lg font-semibold">Аналитика продаж</h2>
      {q.isPending ? (
        <div
          role="status"
          aria-label="Загружаем аналитику…"
          className="space-y-3"
        >
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : q.isError ? (
        <div>
          <p role="alert" className={ALERT_CLASS}>
            {q.error.message}
          </p>
          <button
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => void q.refetch()}
          >
            Повторить
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            {q.data.from} — {q.data.to} · текущие данные, обновляются сразу — в
            отличие от сохранённых отчётов в архиве ниже
          </p>
          <div className="mt-3">
            <BarChart
              items={[
                {
                  key: 'booked',
                  label: 'Забронировано',
                  value: Number(q.data.totals.bookedAreaSqm),
                  displayValue: `${q.data.totals.bookedAreaSqm} м²`,
                  barClassName: badgeToneBarClass('info'),
                },
                {
                  key: 'sold',
                  label: 'Продано',
                  value: Number(q.data.totals.soldAreaSqm),
                  displayValue: `${q.data.totals.soldAreaSqm} м²`,
                  barClassName: badgeToneBarClass('success'),
                },
              ]}
            />
          </div>
          <dl className="mt-3">
            <Metric
              name="Сумма продаж"
              value={formatTyiynAsSom(q.data.totals.soldAmountTyiyn)}
            />
          </dl>
          <h3 className="mt-5 font-medium">Команда</h3>
          {q.data.perManager.length === 0 ? (
            <p className="text-sm text-zinc-500">Сотрудников пока нет.</p>
          ) : (
            <>
              <div className="mt-2">
                <BarChart
                  items={q.data.perManager.map((m) => ({
                    key: m.userId,
                    label: m.fullName,
                    value: Number(m.signedContracts.areaSqm),
                    displayValue: `${m.signedContracts.areaSqm} м² · ${formatTyiynAsSom(m.signedContracts.totalAmountTyiyn)}`,
                    barClassName: badgeToneBarClass('info'),
                  }))}
                />
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[45rem] w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="py-2">Сотрудник</th>
                      <th>Брони</th>
                      <th>Договоры</th>
                      <th>Смены</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.perManager.map((m) => (
                      <tr
                        key={m.userId}
                        className="border-t border-zinc-200 dark:border-zinc-800"
                      >
                        <td className="py-2">{m.fullName}</td>
                        <td>
                          {m.bookings.count} · {m.bookings.areaSqm} м²
                        </td>
                        <td>
                          {m.signedContracts.count} ·{' '}
                          {m.signedContracts.areaSqm} м² ·{' '}
                          {formatTyiynAsSom(m.signedContracts.totalAmountTyiyn)}
                        </td>
                        <td>
                          {m.attendance.workedShifts} рабочих ·{' '}
                          {m.attendance.missedShifts} пропусков ·{' '}
                          {m.attendance.dayOffs} выходных
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
