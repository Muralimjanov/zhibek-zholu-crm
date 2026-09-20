'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import ErrorState from '@/components/ui/ErrorState'
import { showToast } from '@/components/ui/toast-store'
import { describeApiError } from '@/features/auth/error-messages'
import { formatRole } from '@/features/auth/labels'
import type { User } from '@/types/auth'
import { CREATE_USER_ACTION_TYPE, type PendingAction } from '@/types/users'
import { describeConfirmError } from '../errors'
import { formatActionStatus, formatActionType, formatDateTime } from '../labels'
import { isPendingActionExpired } from '../pending'
import {
  useConfirmAction,
  usePendingActionsQuery,
  useRejectAction,
} from '../queries'
import { confirmCodeSchema } from '../schema'
import {
  DANGER_BUTTON_CLASS,
  FIELD_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from './section'

/** Человекопонятное описание запроса без UUID в тексте (только в `key`/URL/сети). */
function describePendingAction(action: PendingAction): string {
  if (action.summary) {
    return action.summary
  }

  if (action.type === CREATE_USER_ACTION_TYPE) {
    return 'Запрос на создание сотрудника'
  }

  if (action.type) {
    return `Запрос: ${formatActionType(action.type)}`
  }

  return 'Запрос без описания'
}

function ActionDetails({
  action,
  expired,
}: {
  action: PendingAction
  expired: boolean
}) {
  const rows: [string, string][] = []

  if (action.type) {
    rows.push(['Тип', formatActionType(action.type)])
  }

  if (action.status) {
    rows.push(['Статус', formatActionStatus(action.status)])
  }

  if (action.createdAt) {
    rows.push(['Создан', formatDateTime(action.createdAt)])
  }

  if (action.expiresAt) {
    rows.push(['Действует до', formatDateTime(action.expiresAt)])
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {describePendingAction(action)}
        </p>
        {expired ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Срок истёк
          </span>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-2 text-sm">
              <dt className="text-zinc-500 dark:text-zinc-400">{label}:</dt>
              <dd className="min-w-0 break-words text-zinc-800 dark:text-zinc-200">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

function PendingActionRow({
  action,
  onResolved,
}: {
  action: PendingAction
  onResolved: (message: string) => void
}) {
  const codeId = useId()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [askReject, setAskReject] = useState(false)
  const confirmMutation = useConfirmAction()
  const rejectMutation = useRejectAction()

  const busy = confirmMutation.isPending || rejectMutation.isPending
  const expired = isPendingActionExpired(action)
  const supported = action.type === CREATE_USER_ACTION_TYPE

  const handleConfirm = async () => {
    setError(null)

    const parsed = confirmCodeSchema.safeParse(code)

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Проверьте код')

      return
    }

    try {
      const created = await confirmMutation.mutateAsync({
        id: action.id,
        code: parsed.data,
      })

      // Код в интерфейсе не оставляем.
      setCode('')
      onResolved(
        `Аккаунт создан: ${created.fullName} (${created.username}), роль — ${formatRole(created.role)}.`,
      )
      showToast('Запрос одобрен, сотрудник создан')
    } catch (confirmError) {
      setCode('')
      setError(describeConfirmError(confirmError))
    }
  }

  const handleReject = async () => {
    setError(null)

    try {
      await rejectMutation.mutateAsync(action.id)
      setAskReject(false)
      onResolved('Запрос отклонён.')
      showToast('Запрос отклонён')
    } catch (rejectError) {
      setError(describeApiError(rejectError))
    }
  }

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <ActionDetails action={action} expired={expired} />

      {supported ? (
        <>
          {expired ? (
            <p className="mt-3 text-sm text-amber-800 dark:text-amber-300">
              Срок действия запроса истёк. Скорее всего, код уже не подойдёт —
              попросите создать запрос заново.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-56">
              <label
                htmlFor={codeId}
                className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
              >
                Код из письма
              </label>
              <input
                id={codeId}
                type="password"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                maxLength={16}
                value={code}
                disabled={busy}
                onChange={(event) => {
                  setCode(event.target.value)
                }}
                aria-invalid={error ? true : undefined}
                className={FIELD_CLASS}
              />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleConfirm()}
              className={PRIMARY_BUTTON_CLASS}
            >
              {confirmMutation.isPending ? 'Проверяем…' : 'Подтвердить'}
            </button>

            {askReject ? null : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setAskReject(true)
                }}
                className={SECONDARY_BUTTON_CLASS}
              >
                Отклонить
              </button>
            )}
          </div>

          {askReject ? (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                Отклонить этот запрос? Аккаунт создан не будет, отменить
                действие нельзя.
              </p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleReject()}
                  className={DANGER_BUTTON_CLASS}
                >
                  {rejectMutation.isPending ? 'Отклоняем…' : 'Да, отклонить'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAskReject(false)
                  }}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Этот тип запроса пока не поддерживается в интерфейсе. Обработайте его
          через API или дождитесь соответствующего раздела CRM.
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </li>
  )
}

export function PendingActions({ currentUser }: { currentUser: User }) {
  const [notice, setNotice] = useState<string | null>(null)
  const { data, isPending, isError, error, refetch, isFetching } =
    usePendingActionsQuery(true)

  return (
    <section className={SECTION_CLASS} aria-labelledby="pending-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pending-heading" className={SECTION_TITLE_CLASS}>
          Запросы на подтверждение
        </h2>
        <button
          type="button"
          disabled={isFetching}
          onClick={() => void refetch()}
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline underline-offset-4 disabled:opacity-60 dark:text-brand-300"
        >
          {isFetching ? 'Обновляем…' : 'Обновить'}
        </button>
      </div>

      {currentUser.email === null ? (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          У вашей учётной записи не указана почта, поэтому код подтверждения
          может быть некуда отправить.{' '}
          <Link
            href="/profile"
            className="font-medium underline underline-offset-4"
          >
            Укажите почту в профиле
          </Link>
          .
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-zinc-200 bg-surface-muted px-3 py-2 text-sm text-zinc-800 dark:border-zinc-800 dark:text-zinc-200"
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-4">
        {isPending ? (
          <p role="status" className="text-sm text-zinc-500">
            Загружаем запросы…
          </p>
        ) : isError ? (
          <ErrorState
            message={describeApiError(error)}
            onRetry={() => void refetch()}
          />
        ) : data.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ожидающих запросов нет.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((action) => (
              <PendingActionRow
                key={action.id}
                action={action}
                onResolved={setNotice}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default PendingActions
