'use client'
import { usePageBreadcrumb } from '@/components/layout/breadcrumb-store'
import ErrorState from '@/components/ui/ErrorState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useSession } from '@/features/auth/useSession'
import NoAccess from '@/features/bookings/components/NoAccess'
import {
  ALERT_CLASS,
  SECTION_CLASS,
} from '@/features/bookings/components/section'
import { ApiError } from '@/lib/api/client'
import { allowedReportTypes } from '../access'
import { useReportQuery } from '../queries'
import { ReportView, reportTypeLabel } from './ReportView'
export default function ReportDetailScreen({ id }: { id: string }) {
  const { user } = useSession()
  const types = allowedReportTypes(user?.role)
  const q = useReportQuery(id, types.length > 0)
  usePageBreadcrumb(
    'Отчёты',
    '/reports',
    q.data ? `${reportTypeLabel(q.data.type)} · ${q.data.date}` : null,
  )
  if (!user) return null
  if (!types.length)
    return <NoAccess reason="Ежедневные отчёты недоступны вашей роли." />
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Отчёты"
        title={
          q.data ? `${reportTypeLabel(q.data.type)} · ${q.data.date}` : 'Отчёт'
        }
      />
      <section className={SECTION_CLASS}>
        {q.isPending ? (
          <p role="status" className="text-sm text-zinc-500">
            Загружаем отчёт…
          </p>
        ) : q.isError ? (
          <ErrorState
            message={
              q.error instanceof ApiError && q.error.status === 404
                ? 'Отчёт не найден или недоступен.'
                : q.error.message
            }
            onRetry={() => void q.refetch()}
          />
        ) : types.includes(q.data.type) ? (
          <ReportView report={q.data} />
        ) : (
          <p role="alert" className={ALERT_CLASS}>
            Отчёт недоступен.
          </p>
        )}
      </section>
    </div>
  )
}
