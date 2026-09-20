'use client'

import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { describeConfirmationError } from '@/features/auth/error-messages'
import { useEmailCodeConfirm } from '@/features/auth/useEmailCodeConfirm'
import {
  ALERT_CLASS,
  ERROR_CLASS,
  NOTICE_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import TextField from '@/features/bookings/components/TextField'
import {
  formatPercent,
  formatTyiynAsSom,
  normalizeDecimal2Input,
  somToTyiyn,
} from '@/features/contracts/money'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import { describePayrollError } from '../errors'
import {
  payrollSettingsSchema,
  type PayrollSettingsFormValues,
} from '../schema'
import { usePayrollSettingsQuery, useUpdatePayrollSettings } from '../queries'

const resolver = createZodResolver(payrollSettingsSchema)

/**
 * Настройки налога и штрафа. Живьём подтверждено (`PAYROLL_API_EXAMPLES.md`):
 * `GET /payroll/settings` до первой настройки отдаёт пустое тело — это
 * подлинное «не настроено», а не ошибка. Писать может только бухгалтер
 * (`canManage`); директору показываем то же самое только для чтения.
 */
export function PayrollSettingsCard({ canManage }: { canManage: boolean }) {
  const query = usePayrollSettingsQuery(true)

  return (
    <section
      className={SECTION_CLASS}
      aria-labelledby="payroll-settings-heading"
    >
      <h2 id="payroll-settings-heading" className={SECTION_TITLE_CLASS}>
        Налог и штраф за прогул
      </h2>

      {query.isPending ? (
        <p role="status" className="mt-3 text-sm text-zinc-500">
          Загружаем настройки…
        </p>
      ) : query.isError ? (
        <div className="mt-3 space-y-3">
          <p role="alert" className={ALERT_CLASS}>
            {describePayrollError(query.error)}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className={SECONDARY_BUTTON_CLASS}
          >
            Повторить
          </button>
        </div>
      ) : canManage ? (
        <PayrollSettingsForm
          finePerMissedShiftTyiyn={query.data?.finePerMissedShiftTyiyn ?? null}
          taxRatePercent={query.data?.taxRatePercent ?? null}
        />
      ) : query.data ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">
              Штраф за прогул
            </dt>
            <dd className="text-zinc-900 dark:text-zinc-50">
              {formatTyiynAsSom(query.data.finePerMissedShiftTyiyn)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">Налог</dt>
            <dd className="text-zinc-900 dark:text-zinc-50">
              {formatPercent(query.data.taxRatePercent)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Настройки ещё не заданы.
        </p>
      )}
    </section>
  )
}

/** "5000000" тыйын → "50000" сом, для поля ввода — тот же приём, что в `contracts/EditContractForm`. */
function tyiynToSomInput(value: string | null): string {
  if (!value) {
    return ''
  }

  const digits = value.padStart(3, '0')
  const whole = digits.slice(0, -2).replace(/^0+(?=\d)/, '') || '0'
  const fraction = digits.slice(-2)

  return fraction === '00' ? whole : `${whole}.${fraction}`
}

function PayrollSettingsForm({
  finePerMissedShiftTyiyn,
  taxRatePercent,
}: {
  finePerMissedShiftTyiyn: string | null
  taxRatePercent: string | null
}) {
  const fineId = useId()
  const taxId = useId()
  const codeId = useId()

  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const challenge = useEmailCodeConfirm('payroll.settings.update')
  const mutation = useUpdatePayrollSettings()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PayrollSettingsFormValues>({
    resolver,
    defaultValues: {
      finePerMissedShift: tyiynToSomInput(finePerMissedShiftTyiyn),
      taxRatePercent: taxRatePercent ?? '',
    },
  })

  if (!editing) {
    return (
      <div className="mt-3 space-y-3">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">
              Штраф за прогул
            </dt>
            <dd className="text-zinc-900 dark:text-zinc-50">
              {formatTyiynAsSom(finePerMissedShiftTyiyn)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">Налог</dt>
            <dd className="text-zinc-900 dark:text-zinc-50">
              {formatPercent(taxRatePercent)}
            </dd>
          </div>
        </dl>

        {notice ? (
          <p role="status" className={NOTICE_CLASS}>
            {notice}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => {
            // Форма не размонтируется между открытиями — без явного `reset()`
            // здесь поля показывали бы значения на момент первого монтирования,
            // а не то, что реально хранится на сервере сейчас (например, после
            // уже сохранённой правки).
            reset({
              finePerMissedShift: tyiynToSomInput(finePerMissedShiftTyiyn),
              taxRatePercent: taxRatePercent ?? '',
            })
            setEditing(true)
            setNotice(null)
            void challenge.requestCode()
          }}
          className={SECONDARY_BUTTON_CLASS}
        >
          {finePerMissedShiftTyiyn ? 'Изменить' : 'Задать настройки'}
        </button>
      </div>
    )
  }

  const cancel = () => {
    setEditing(false)
    setCode('')
    setSubmitError(null)
    challenge.reset()
    reset()
  }

  /**
   * `mutateAsync` вместо `mutate` — RHF держит `isSubmitting: true` (а с ним
   * задизейблены поля, код и «Отмена») до тех пор, пока не отработает и сам
   * `PUT`, и возвращённый из `onSuccess` промис инвалидации в `queries.ts`:
   * иначе `handleSubmit` возвращался бы сразу после синхронного `mutate()`,
   * разблокируя форму до реального ответа сервера. При ошибке значения полей
   * не сбрасываем — `reset()` здесь не вызывается.
   */
  const onSubmit = handleSubmit(async (values) => {
    const fine = somToTyiyn(values.finePerMissedShift)
    const tax = normalizeDecimal2Input(values.taxRatePercent)

    if (!fine || !tax) {
      setSubmitError('Проверьте формат штрафа и налога.')

      return
    }

    if (code.trim() === '') {
      setSubmitError('Введите код из письма.')

      return
    }

    setSubmitError(null)

    try {
      await mutation.mutateAsync({
        input: { finePerMissedShiftTyiyn: fine, taxRatePercent: tax },
        headers: challenge.headersFor(code.trim()),
      })
      setEditing(false)
      setCode('')
      challenge.reset()
      setNotice('Настройки сохранены.')
    } catch (mutationError) {
      setSubmitError(describeConfirmationError(mutationError))
    }
  })

  return (
    <form className="mt-3 space-y-4" onSubmit={onSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={fineId}
          label="Штраф за прогул, сом"
          inputMode="decimal"
          disabled={isSubmitting}
          error={errors.finePerMissedShift?.message}
          {...register('finePerMissedShift')}
        />
        <TextField
          id={taxId}
          label="Налог, %"
          inputMode="decimal"
          disabled={isSubmitting}
          error={errors.taxRatePercent?.message}
          {...register('taxRatePercent')}
        />
      </div>

      {challenge.phase === 'requesting' ? (
        <p role="status" className="text-sm text-zinc-500">
          Отправляем код на почту…
        </p>
      ) : challenge.phase === 'awaiting-code' ? (
        <p role="status" className="text-sm text-zinc-500">
          Код подтверждения отправлен на вашу почту.
        </p>
      ) : null}

      {challenge.error ? (
        <p role="alert" className={ALERT_CLASS}>
          {challenge.error}
        </p>
      ) : null}

      <TextField
        id={codeId}
        label="Код из письма"
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        disabled={isSubmitting || challenge.phase !== 'awaiting-code'}
        value={code}
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
          type="submit"
          disabled={isSubmitting || challenge.phase !== 'awaiting-code'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isSubmitting ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={cancel}
          className={SECONDARY_BUTTON_CLASS}
        >
          Отмена
        </button>
      </div>
    </form>
  )
}

export default PayrollSettingsCard
