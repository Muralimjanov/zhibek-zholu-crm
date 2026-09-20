'use client'

import { useId, useState } from 'react'
import { describeConfirmationError } from '@/features/auth/error-messages'
import { useEmailCodeConfirm } from '@/features/auth/useEmailCodeConfirm'
import {
  ALERT_CLASS,
  DANGER_BUTTON_CLASS,
  ERROR_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'
import TextField from '@/features/bookings/components/TextField'
import { formatTyiynAsSom } from '@/features/contracts/money'
import type { useConfirmPayrollEntry } from '../queries'

/**
 * Подтверждение начисления — защищено кодом на почту (`payroll.confirm`,
 * `resourceId: id`), по образцу `contracts/components/DepositConfirm.tsx`.
 * Не показывает начисление подтверждённым до реального HTTP-успеха.
 *
 * `mutation` поднята в `PayrollEntryDetail` (не создаётся здесь) — тот же
 * экземпляр читает соседний `CorrectPayrollEntryForm`, чтобы блокировать
 * свои поля и `PATCH`, пока идёт `POST /confirm`. `disabled` — общий признак
 * занятой записи оттуда же: пока сохраняется или не сохранена ручная
 * коррекция, или запись перезапрашивается, запрашивать код и подтверждать
 * нельзя — иначе можно подтвердить старую сумму, не заметив несохранённой
 * правки. Сумма в тексте ниже всегда берётся из актуального
 * `finalAmountTyiyn` (проп, а не снимок в состоянии), поэтому и перед
 * отправкой кода, и перед финальным подтверждением показывается то, что
 * реально хранится в обновлённой записи.
 */
export function PayrollEntryConfirm({
  entryId,
  finalAmountTyiyn,
  mutation,
  disabled,
}: {
  entryId: string
  finalAmountTyiyn: string | null
  mutation: ReturnType<typeof useConfirmPayrollEntry>
  disabled: boolean
}) {
  const codeId = useId()
  const [confirming, setConfirming] = useState(false)
  const [code, setCode] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const challenge = useEmailCodeConfirm('payroll.confirm', entryId)

  if (!confirming) {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setConfirming(true)
            void challenge.requestCode()
          }}
          className={SECONDARY_BUTTON_CLASS}
        >
          Подтвердить начисление
        </button>
        {disabled ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Сначала сохраните или отмените правку коррекции.
          </p>
        ) : null}
      </div>
    )
  }

  const cancel = () => {
    setConfirming(false)
    setCode('')
    setSubmitError(null)
    challenge.reset()
  }

  const submit = () => {
    // Повторная проверка на случай, если правка коррекции стала
    // несохранённой уже после того, как код был запрошен — кнопка ниже
    // и так дизейблится через `disabled`, это защита от гонки состояний.
    if (disabled) {
      setSubmitError(
        'Есть несохранённая правка коррекции — сохраните или отмените её.',
      )

      return
    }

    if (code.trim() === '') {
      setSubmitError('Введите код из письма.')

      return
    }

    setSubmitError(null)
    mutation.mutate(challenge.headersFor(code.trim()), {
      onError: (mutationError) => {
        setSubmitError(describeConfirmationError(mutationError))
      },
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
      <p className="text-sm text-amber-900 dark:text-amber-200">
        Подтвердить начисление к выплате {formatTyiynAsSom(finalAmountTyiyn)}?
        После подтверждения править его будет нельзя.
      </p>

      {challenge.phase === 'requesting' ? (
        <p role="status" className="text-sm text-amber-900 dark:text-amber-200">
          Отправляем код на почту…
        </p>
      ) : challenge.phase === 'awaiting-code' ? (
        <p className="text-sm text-amber-900 dark:text-amber-200">
          Код подтверждения отправлен на вашу почту.
        </p>
      ) : null}

      {challenge.error ? (
        <p role="alert" className={ALERT_CLASS}>
          {challenge.error}
        </p>
      ) : null}

      {disabled ? (
        <p role="alert" className={ALERT_CLASS}>
          Есть несохранённые изменения коррекции или запись обновляется —
          подтверждение временно недоступно.
        </p>
      ) : null}

      {challenge.phase === 'awaiting-code' ? (
        <>
          <TextField
            id={codeId}
            label="Код из письма"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            disabled={mutation.isPending}
            onChange={(event) => {
              setCode(event.target.value)
            }}
          />

          {submitError ? (
            <p role="alert" className={ERROR_CLASS}>
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={mutation.isPending || disabled}
              onClick={submit}
              className={DANGER_BUTTON_CLASS}
            >
              {mutation.isPending ? 'Подтверждаем…' : 'Да, подтвердить'}
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={cancel}
              className={SECONDARY_BUTTON_CLASS}
            >
              Отмена
            </button>
          </div>
        </>
      ) : challenge.phase === 'idle' && challenge.error ? (
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => void challenge.requestCode()}
            className={SECONDARY_BUTTON_CLASS}
          >
            Запросить код ещё раз
          </button>
          <button
            type="button"
            onClick={cancel}
            className={SECONDARY_BUTTON_CLASS}
          >
            Отмена
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default PayrollEntryConfirm
