'use client'

import { useId, useState } from 'react'
import { describeConfirmationError } from '@/features/auth/error-messages'
import { useEmailCodeConfirm } from '@/features/auth/useEmailCodeConfirm'
import {
  ALERT_CLASS,
  ERROR_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'
import { formatTyiynAsSom } from '../money'
import { useMarkDeposit } from '../queries'

/**
 * Подтверждение взноса — с API 0.2.0 защищено кодом на почту
 * (`action: "contract.deposit"`). Ничего не показывает как «оплачено» до
 * реального HTTP-успеха: код только доводит до заголовков запроса.
 */
export function DepositConfirm({
  contractId,
  depositAmountTyiyn,
}: {
  contractId: string
  depositAmountTyiyn: string | null
}) {
  const codeId = useId()
  const [code, setCode] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const challenge = useEmailCodeConfirm('contract.deposit', contractId)
  const mutation = useMarkDeposit(contractId)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => {
          setConfirming(true)
          void challenge.requestCode()
        }}
        className={SECONDARY_BUTTON_CLASS}
      >
        Подтвердить оплату взноса
      </button>
    )
  }

  const cancel = () => {
    setConfirming(false)
    setCode('')
    setSubmitError(null)
    challenge.reset()
  }

  const submit = () => {
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
    <div className="mt-4 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
      <p className="text-sm text-amber-900 dark:text-amber-200">
        Отметить взнос {formatTyiynAsSom(depositAmountTyiyn)} оплаченным?
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

      {challenge.phase === 'awaiting-code' ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor={codeId} className={LABEL_CLASS}>
              Код из письма
            </label>
            <input
              id={codeId}
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              disabled={mutation.isPending}
              onChange={(event) => {
                setCode(event.target.value)
              }}
              className={FIELD_CLASS}
            />
          </div>

          {submitError ? (
            <p role="alert" className={ERROR_CLASS}>
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={submit}
              className={PRIMARY_BUTTON_CLASS}
            >
              {mutation.isPending ? 'Подтверждаем…' : 'Да, взнос оплачен'}
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

export default DepositConfirm
