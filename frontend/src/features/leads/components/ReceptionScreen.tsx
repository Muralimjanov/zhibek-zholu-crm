'use client'

import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { describeApiError } from '@/features/auth/error-messages'
import { useSession } from '@/features/auth/useSession'
import { formatArea } from '@/features/bookings/area'
import NoAccess from '@/features/bookings/components/NoAccess'
import {
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import { LEAD_STATUS_LABELS } from '@/types/lead'
import { fetchLeads } from '../api'
import { canCreateLead } from '../access'
import { readLeadPage } from '../parse'
import LeadForm from './LeadForm'

function isToday(value: string): boolean {
  const date = new Date(value)
  const now = new Date()

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

/**
 * Рабочее место ресепшена: форма приёма обращения и список того, что уже
 * записано сегодня — чтобы не завести одного человека дважды и сразу
 * увидеть, что запись прошла.
 */
export default function ReceptionScreen() {
  const { user } = useSession()

  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: async () => readLeadPage(await fetchLeads({ limit: 100 })),
    enabled: user !== null && canCreateLead(user.role),
    retry: false,
  })

  if (!user) {
    return null
  }

  if (!canCreateLead(user.role)) {
    return <NoAccess reason="Эта страница — рабочее место ресепшена. Обращения записывает ресепшен." />
  }

  const today = (leadsQuery.data?.items ?? []).filter((lead) => isToday(lead.createdAt))

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Ресепшен"
        title="Приём обращений"
        description="Запишите клиента — обращение уйдёт начальнику отдела продаж."
      />

      <LeadForm />

      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>Записано сегодня</h2>

        {leadsQuery.isError ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {describeApiError(leadsQuery.error)}
          </p>
        ) : today.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Сегодня обращений ещё не было.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {today.map((lead) => (
              <li key={lead.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {lead.lastName} {lead.firstName}
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {lead.phone} · {formatArea(lead.desiredAreaSqm)} · {LEAD_STATUS_LABELS[lead.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
