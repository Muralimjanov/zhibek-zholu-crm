'use client'

import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import {
  TABLE_CELL_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
} from '@/components/ui/table'
import TableCard from '@/components/ui/TableCard'
import TableSkeleton from '@/components/ui/TableSkeleton'
import { useSession } from '@/features/auth/useSession'
import { formatRole } from '@/features/auth/labels'
import { useManagerDisplayName } from '@/features/bookings/managerDirectory'
import {
  ALERT_CLASS,
  ERROR_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  NOTICE_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import { useUsersQuery } from '@/features/users/queries'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import type { KnownUserRole } from '@/types/auth'
import type { CreateDayOffRequest, DayOff } from '@/types/shift'
import {
  assignableDayOffRoles,
  canCreateDayOff,
  canListUsers,
  isActiveStaff,
} from '../access'
import { todayInBishkek } from '../date'
import { describeShiftError } from '../errors'
import { formatDateOnly } from '../labels'
import { useCreateDayOff, useDayOffsQuery } from '../queries'
import { createDayOffSchema, type CreateDayOffFormValues } from '../schema'

const resolver = createZodResolver(createDayOffSchema)
const EMPTY: CreateDayOffFormValues = { userId: '', date: '', reason: '' }

function CreateDayOffForm() {
  const { user } = useSession()
  const role = user?.role
  const userIdFieldId = useId()
  const dateId = useId()
  const reasonId = useId()

  const usersQuery = useUsersQuery(canListUsers(role))
  const mutation = useCreateDayOff()
  const [serverError, setServerError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateDayOffFormValues>({ resolver, defaultValues: EMPTY })

  const assignableRoles = assignableDayOffRoles(role)
  const candidates = (usersQuery.data ?? []).filter(
    (item) =>
      assignableRoles.includes(item.role as KnownUserRole) &&
      isActiveStaff(item),
  )

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    setNotice(null)

    const payload: CreateDayOffRequest = {
      userId: values.userId,
      date: values.date,
    }

    const reason = values.reason.trim()

    if (reason !== '') {
      payload.reason = reason
    }

    try {
      await mutation.mutateAsync(payload)
      setNotice('Выходной согласован.')
      reset(EMPTY)
    } catch (error) {
      setServerError(describeShiftError(error))
    }
  })

  return (
    <form className="mt-5 space-y-4" onSubmit={onSubmit} noValidate>
      {serverError ? (
        <p role="alert" className={ALERT_CLASS}>
          {serverError}
        </p>
      ) : null}

      {notice ? (
        <p role="status" className={NOTICE_CLASS}>
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor={userIdFieldId} className={LABEL_CLASS}>
            Сотрудник
          </label>
          <select
            id={userIdFieldId}
            disabled={isSubmitting || usersQuery.isPending}
            className={FIELD_CLASS}
            {...register('userId')}
          >
            <option value="">Выберите сотрудника</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.fullName} ({candidate.username},{' '}
                {formatRole(candidate.role)})
              </option>
            ))}
          </select>
          {errors.userId ? (
            <p className={ERROR_CLASS}>{errors.userId.message}</p>
          ) : usersQuery.isError ? (
            <p className={ERROR_CLASS}>
              Не удалось загрузить список сотрудников.
            </p>
          ) : !usersQuery.isPending && candidates.length === 0 ? (
            <p className={ERROR_CLASS}>Нет доступных активных сотрудников.</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={dateId} className={LABEL_CLASS}>
            Дата
          </label>
          <input
            id={dateId}
            type="date"
            min={todayInBishkek()}
            disabled={isSubmitting}
            className={FIELD_CLASS}
            {...register('date')}
          />
          {errors.date ? (
            <p className={ERROR_CLASS}>{errors.date.message}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={reasonId} className={LABEL_CLASS}>
            Причина <span className="text-zinc-500">— необязательно</span>
          </label>
          <input
            id={reasonId}
            type="text"
            disabled={isSubmitting}
            className={FIELD_CLASS}
            {...register('reason')}
          />
          {errors.reason ? (
            <p className={ERROR_CLASS}>{errors.reason.message}</p>
          ) : null}
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className={PRIMARY_BUTTON_CLASS}
      >
        {isSubmitting ? 'Согласуем…' : 'Согласовать выходной'}
      </button>
    </form>
  )
}

function DayOffsTable({ items }: { items: DayOff[] }) {
  const { user } = useSession()
  const employeeName = useManagerDisplayName(user?.role, user?.id)

  return (
    <TableCard>
      <table className="w-full min-w-[36rem] border-collapse">
        <caption className="sr-only">Список выходных</caption>
        <thead>
          <tr className={TABLE_HEAD_ROW_CLASS}>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Сотрудник
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Дата
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Причина
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((dayOff) => (
            <tr key={dayOff.id} className={TABLE_ROW_CLASS}>
              <td className={TABLE_CELL_CLASS}>
                {employeeName(dayOff.userId)}
              </td>
              <td className={TABLE_CELL_CLASS}>
                {formatDateOnly(dayOff.date)}
              </td>
              <td className={TABLE_CELL_CLASS}>{dayOff.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

const PAGE_SIZE = 20

export function DayOffsSection() {
  const { user } = useSession()
  const [offset, setOffset] = useState(0)
  const query = useDayOffsQuery({ limit: PAGE_SIZE, offset }, true)

  const total = query.data?.total ?? 0
  const shownFrom = total === 0 ? 0 : offset + 1
  const shownTo = Math.min(offset + (query.data?.items.length ?? 0), total)

  return (
    <section className={SECTION_CLASS} aria-labelledby="dayoffs-heading">
      <h2 id="dayoffs-heading" className={SECTION_TITLE_CLASS}>
        Выходные
      </h2>

      <div className="mt-4">
        {query.isPending ? (
          <TableSkeleton
            caption="Загружаем список выходных"
            columns={['Сотрудник', 'Дата', 'Причина']}
            minWidthClassName="min-w-[36rem]"
          />
        ) : query.isError ? (
          <ErrorState
            message={describeShiftError(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : !query.data || query.data.items.length === 0 ? (
          <EmptyState
            title="Выходных пока нет"
            description="Согласованные выходные появятся здесь."
          />
        ) : (
          <div className="space-y-4">
            <p aria-live="polite" className="text-sm text-muted">
              Показаны {shownFrom}–{shownTo} из {total}
            </p>
            <DayOffsTable items={query.data.items} />
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={offset === 0 || query.isFetching}
                onClick={() => {
                  setOffset((value) => Math.max(0, value - PAGE_SIZE))
                }}
                className={SECONDARY_BUTTON_CLASS}
              >
                Назад
              </button>
              <button
                type="button"
                disabled={shownTo >= total || query.isFetching}
                onClick={() => {
                  setOffset((value) => value + PAGE_SIZE)
                }}
                className={SECONDARY_BUTTON_CLASS}
              >
                Вперёд
              </button>
            </div>
          </div>
        )}
      </div>

      {canCreateDayOff(user?.role) ? <CreateDayOffForm /> : null}
    </section>
  )
}

export default DayOffsSection
