'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { PageHeader } from '@/components/ui/PageHeader'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { describeApiError } from '@/features/auth/error-messages'
import { useSession } from '@/features/auth/useSession'
import { formatArea } from '@/features/bookings/area'
import { isActiveStaff } from '@/features/bookings/access'
import NoAccess from '@/features/bookings/components/NoAccess'
import {
  ALERT_CLASS,
  FIELD_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import { useUsersQuery } from '@/features/users/queries'
import { LEAD_STATUS_LABELS, type Lead } from '@/types/lead'
import { assignLead, fetchLeads, rejectLead } from '../api'
import {
  canAssignLead,
  canCreateLead,
  canRejectLead,
  canViewLeadsSection,
  isLeadsReadOnly,
} from '../access'
import { readLeadPage } from '../parse'
import ConvertLeadDialog from './ConvertLeadDialog'
import LeadForm from './LeadForm'

const STATUS_TONE: Record<Lead['status'], string> = {
  new: 'bg-surface-muted text-zinc-700 dark:text-zinc-200',
  assigned: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200',
  converted: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  rejected: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400',
}

function formatDate(value: string): string {
  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Раздел «Лиды» — общий для всех, кто участвует в воронке, но каждый видит
 * своё: ресепшен свои записи и форму, начальник продаж нераспределённые и
 * команду, менеджер назначенные ему, директор всё, но только на чтение.
 */
export default function LeadsScreen() {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  const [converting, setConverting] = useState<Lead | null>(null)

  const role = user?.role ?? null
  const mayAssign = canAssignLead(role)

  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: async () => readLeadPage(await fetchLeads({ limit: 100 })),
    enabled: user !== null && canViewLeadsSection(role),
    retry: false,
  })

  // Список менеджеров нужен только начальнику продаж — для назначения.
  const usersQuery = useUsersQuery(mayAssign)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['leads'] })
  }

  const assignMutation = useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string }) => assignLead(id, managerId),
    onSuccess: invalidate,
    onError: (error) => setActionError(describeApiError(error)),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectLead(id),
    onSuccess: invalidate,
    onError: (error) => setActionError(describeApiError(error)),
  })

  if (!user) {
    return null
  }

  if (!canViewLeadsSection(role)) {
    return (
      <NoAccess reason="Раздел «Лиды» доступен ресепшену, менеджерам, начальнику отдела продаж и директору." />
    )
  }

  const managers = (usersQuery.data ?? []).filter(
    (item) => item.role === 'sales_manager' && isActiveStaff(item),
  )
  const leads = leadsQuery.data?.items ?? []

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Операции"
        title="Лиды"
        description={
          isLeadsReadOnly(role)
            ? 'Обращения с ресепшена. Только просмотр.'
            : 'Обращения с ресепшена: назначьте менеджера и превратите в бронь.'
        }
      />

      {canCreateLead(role) ? <LeadForm /> : null}

      {actionError ? (
        <p className={ALERT_CLASS} role="alert">
          {actionError}
        </p>
      ) : null}

      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>Обращения</h2>

        {leadsQuery.isPending ? (
          <div className="mt-4">
            <TableSkeleton
              caption="Обращения"
              columns={['Клиент', 'Телефон', 'Площадь', 'Создано', 'Статус', 'Действие']}
              rows={4}
              minWidthClassName="min-w-[42rem]"
            />
          </div>
        ) : leadsQuery.isError ? (
          <div className="mt-4">
            <ErrorState
              message={describeApiError(leadsQuery.error)}
              onRetry={() => void leadsQuery.refetch()}
            />
          </div>
        ) : leads.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Обращений пока нет"
              description={
                canCreateLead(role)
                  ? 'Заполните форму выше, когда позвонит или придёт клиент.'
                  : 'Как только ресепшен запишет обращение, оно появится здесь.'
              }
            />
          </div>
        ) : (
          // На узком экране таблица прокручивается вбок, а не ломает вёрстку.
          <div className="mt-4 -mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-caption text-zinc-500 dark:text-zinc-400">
                  <th className="py-2 pr-4 font-medium">Клиент</th>
                  <th className="py-2 pr-4 font-medium">Телефон</th>
                  <th className="py-2 pr-4 font-medium">Площадь</th>
                  <th className="py-2 pr-4 font-medium">Создано</th>
                  <th className="py-2 pr-4 font-medium">Статус</th>
                  <th className="py-2 font-medium">Действие</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                    <td className="py-3 pr-4">
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        {lead.lastName} {lead.firstName}
                      </span>
                      {lead.comment ? (
                        <span className="mt-1 block text-caption text-zinc-500 dark:text-zinc-400">
                          {lead.comment}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <a className="underline underline-offset-4" href={`tel:${lead.phone.replace(/[^+\d]/g, '')}`}>
                        {lead.phone}
                      </a>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">{formatArea(lead.desiredAreaSqm)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{formatDate(lead.createdAt)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-caption font-medium ${STATUS_TONE[lead.status]}`}>
                        {LEAD_STATUS_LABELS[lead.status]}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        {mayAssign && lead.status !== 'converted' && lead.status !== 'rejected' ? (
                          <select
                            className={`${FIELD_CLASS} min-h-11 w-auto`}
                            value={lead.assignedManagerId ?? ''}
                            disabled={assignMutation.isPending}
                            onChange={(event) => {
                              const managerId = event.target.value

                              if (managerId !== '') {
                                setActionError(null)
                                assignMutation.mutate({ id: lead.id, managerId })
                              }
                            }}
                          >
                            <option value="">Назначить менеджера…</option>
                            {managers.map((manager) => (
                              <option key={manager.id} value={manager.id}>
                                {manager.fullName}
                              </option>
                            ))}
                          </select>
                        ) : null}

                        {canRejectLead(role) && lead.status === 'assigned' ? (
                          <button
                            type="button"
                            className={SECONDARY_BUTTON_CLASS}
                            disabled={rejectMutation.isPending}
                            onClick={() => {
                              setActionError(null)
                              setConverting(lead)
                            }}
                          >
                            В бронь
                          </button>
                        ) : null}

                        {canRejectLead(role) && lead.status !== 'converted' && lead.status !== 'rejected' ? (
                          <button
                            type="button"
                            className={SECONDARY_BUTTON_CLASS}
                            disabled={rejectMutation.isPending}
                            onClick={() => {
                              setActionError(null)
                              rejectMutation.mutate(lead.id)
                            }}
                          >
                            Отказ
                          </button>
                        ) : null}

                        {lead.status === 'converted' && lead.bookingId ? (
                          <a className="underline underline-offset-4" href={`/bookings/${lead.bookingId}`}>
                            Открыть бронь
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {converting ? (
        <ConvertLeadDialog
          lead={converting}
          onClose={() => setConverting(null)}
          onConverted={() => {
            setConverting(null)
            invalidate()
          }}
        />
      ) : null}
    </div>
  )
}
