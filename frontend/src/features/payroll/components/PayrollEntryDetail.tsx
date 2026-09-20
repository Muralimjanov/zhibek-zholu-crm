'use client'

import { useState } from 'react'
import {
  ALERT_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'
import { formatPercent, formatTyiynAsSom } from '@/features/contracts/money'
import { isPayrollEntryEditable } from '../access'
import { describePayrollError } from '../errors'
import {
  formatEmployeeName,
  formatPayrollEntryStatus,
  formatPeriod,
} from '../labels'
import {
  useConfirmPayrollEntry,
  useCorrectPayrollEntry,
  usePayrollEntryQuery,
} from '../queries'
import CorrectPayrollEntryForm from './CorrectPayrollEntryForm'
import PayrollEntryConfirm from './PayrollEntryConfirm'

const DT = 'text-xs text-zinc-500 dark:text-zinc-400'
const DD = 'text-zinc-900 dark:text-zinc-50'

/**
 * Карточка одного начисления. Всегда дочитывает `GET /payroll/entries/{id}`
 * заново, а не переиспользует строку списка — это подтверждённый отдельный
 * транспорт задания. `confirmed` не показывает полей правки и кнопки
 * подтверждения (`isPayrollEntryEditable`) — сервер это в любом случае
 * обеспечит (409), но кнопки лучше не показывать заранее.
 */
export function PayrollEntryDetail({
  entryId,
  canManage,
  onClose,
}: {
  entryId: string
  canManage: boolean
  onClose: () => void
}) {
  const query = usePayrollEntryQuery(entryId, true)
  const correctionMutation = useCorrectPayrollEntry(entryId)
  const confirmMutation = useConfirmPayrollEntry(entryId)
  const [correctionDirty, setCorrectionDirty] = useState(false)

  /**
   * Общий признак занятой записи: сохраняется коррекция, идёт подтверждение
   * или запись перезапрашивается после любой из этих мутаций. Обе формы
   * читают его в обе стороны — коррекция блокируется, пока подтверждается
   * (`POST /confirm`), подтверждение блокируется, пока сохраняется коррекция
   * (плюс дополнительно — пока в форме коррекции есть несохранённый ввод,
   * `correctionDirty`, иначе можно подтвердить старую сумму, не заметив
   * несохранённой правки).
   */
  const entryBusy =
    correctionMutation.isPending ||
    confirmMutation.isPending ||
    query.isFetching
  const confirmBlocked = entryBusy || correctionDirty

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-surface-muted p-4 dark:border-zinc-800">
      {query.isPending ? (
        <p role="status" className="text-sm text-zinc-500">
          Загружаем начисление…
        </p>
      ) : query.isError ? (
        <p role="alert" className={ALERT_CLASS}>
          {describePayrollError(query.error)}
        </p>
      ) : (
        <>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className={DT}>Сотрудник</dt>
              <dd className={DD}>
                {formatEmployeeName(query.data.employeeFullName)}
              </dd>
            </div>
            <div>
              <dt className={DT}>Период</dt>
              <dd className={DD}>{formatPeriod(query.data.period)}</dd>
            </div>
            <div>
              <dt className={DT}>Статус</dt>
              <dd className={DD}>
                {formatPayrollEntryStatus(query.data.status)}
              </dd>
            </div>
            <div>
              <dt className={DT}>Оклад</dt>
              <dd className={DD}>
                {formatTyiynAsSom(query.data.baseSalaryTyiyn)}
              </dd>
            </div>
            <div>
              <dt className={DT}>Прогулов</dt>
              <dd className={DD}>{query.data.missedShiftsCount ?? '—'}</dd>
            </div>
            <div>
              <dt className={DT}>Штраф</dt>
              <dd className={DD}>
                {formatTyiynAsSom(query.data.fineAmountTyiyn)}
                {query.data.fineManuallyAdjusted ? ' (скорректирован)' : ''}
              </dd>
            </div>
            <div>
              <dt className={DT}>Налог</dt>
              <dd className={DD}>
                {formatPercent(query.data.taxRatePercent)} ·{' '}
                {formatTyiynAsSom(query.data.taxAmountTyiyn)}
              </dd>
            </div>
            <div>
              <dt className={DT}>К выплате</dt>
              <dd className={DD}>
                {formatTyiynAsSom(query.data.finalAmountTyiyn)}
              </dd>
            </div>
          </dl>

          {canManage && isPayrollEntryEditable(query.data) ? (
            <div className="space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <CorrectPayrollEntryForm
                mutation={correctionMutation}
                disabled={confirmMutation.isPending || query.isFetching}
                onDirtyChange={setCorrectionDirty}
              />
              <PayrollEntryConfirm
                entryId={query.data.id}
                finalAmountTyiyn={query.data.finalAmountTyiyn}
                mutation={confirmMutation}
                disabled={confirmBlocked}
              />
            </div>
          ) : null}
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        className={SECONDARY_BUTTON_CLASS}
      >
        Закрыть карточку
      </button>
    </div>
  )
}

export default PayrollEntryDetail
