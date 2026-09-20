'use client'

import { useState } from 'react'
import {
  ALERT_CLASS,
  DANGER_BUTTON_CLASS,
  NOTICE_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import { describeShiftError } from '../errors'
import { formatBishkekDateTime, formatShiftStatus } from '../labels'
import { readShift } from '../parse'
import { useCloseShift, useCurrentShiftQuery, useOpenShift } from '../queries'

/**
 * Собственная смена. `GET /shifts/current` без открытой смены отдаёт пустое
 * тело (см. `SHIFTS_API_EXAMPLES.md`) — `useCurrentShiftQuery` превращает
 * его в `data: null`, и это ровно то же самое «нет смены», что и после
 * закрытия — не ошибка и не повод для алармистского текста.
 */
export function CurrentShiftCard() {
  const query = useCurrentShiftQuery(true)
  const openMutation = useOpenShift()
  const closeMutation = useCloseShift()

  const [askClose, setAskClose] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reportNotice, setReportNotice] = useState<string | null>(null)

  const handleOpen = async () => {
    setActionError(null)
    setReportNotice(null)

    try {
      await openMutation.mutateAsync()
    } catch (error) {
      setActionError(describeShiftError(error))
    }
  }

  const handleClose = async () => {
    setActionError(null)

    try {
      const response = await closeMutation.mutateAsync()
      const closed = readShift(response)

      setAskClose(false)

      if (closed?.reportGenerated) {
        setReportNotice(
          `Смена закрыта. Сервер создал ежедневный отчёт (${closed.reportGenerated}).`,
        )
      }
    } catch (error) {
      setActionError(describeShiftError(error))
    }
  }

  return (
    <section className={SECTION_CLASS} aria-labelledby="current-shift-heading">
      <h2 id="current-shift-heading" className={SECTION_TITLE_CLASS}>
        Моя смена
      </h2>

      {query.isPending ? (
        <p role="status" className="mt-3 text-sm text-zinc-500">
          Загружаем смену…
        </p>
      ) : query.isError ? (
        <div className="mt-3 space-y-3">
          <p role="alert" className={ALERT_CLASS}>
            {describeShiftError(query.error)}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className={SECONDARY_BUTTON_CLASS}
          >
            Повторить
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {query.data ? (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  Статус
                </dt>
                <dd className="text-zinc-900 dark:text-zinc-50">
                  {formatShiftStatus(query.data.status)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  Открыта
                </dt>
                <dd className="text-zinc-900 dark:text-zinc-50">
                  {formatBishkekDateTime(query.data.openedAt)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Смена сегодня ещё не открыта.
            </p>
          )}

          {reportNotice ? (
            <p role="status" className={NOTICE_CLASS}>
              {reportNotice}
            </p>
          ) : null}

          {actionError ? (
            <p role="alert" className={ALERT_CLASS}>
              {actionError}
            </p>
          ) : null}

          {!query.data ? (
            <button
              type="button"
              disabled={openMutation.isPending}
              onClick={() => void handleOpen()}
              className={PRIMARY_BUTTON_CLASS}
            >
              {openMutation.isPending ? 'Открываем…' : 'Открыть смену'}
            </button>
          ) : query.data.status === 'open' ? (
            askClose ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  Закрыть смену? Это может создать ежедневный отчёт на сервере —
                  действие необратимо через эту форму.
                </p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={closeMutation.isPending}
                    onClick={() => void handleClose()}
                    className={DANGER_BUTTON_CLASS}
                  >
                    {closeMutation.isPending
                      ? 'Закрываем…'
                      : 'Да, закрыть смену'}
                  </button>
                  <button
                    type="button"
                    disabled={closeMutation.isPending}
                    onClick={() => {
                      setAskClose(false)
                    }}
                    className={SECONDARY_BUTTON_CLASS}
                  >
                    Не закрывать
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAskClose(true)
                }}
                className={SECONDARY_BUTTON_CLASS}
              >
                Закрыть смену
              </button>
            )
          ) : null}
        </div>
      )}
    </section>
  )
}

export default CurrentShiftCard
