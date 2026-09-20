'use client'

import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  ALERT_CLASS,
  NOTICE_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'
import TextField from '@/features/bookings/components/TextField'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import { currentPeriodInBishkek } from '../date'
import { describePayrollError } from '../errors'
import { formatPeriod } from '../labels'
import { readPayrollEntryList } from '../parse'
import { useGeneratePayrollEntries } from '../queries'
import {
  generatePayrollEntriesSchema,
  type GeneratePayrollEntriesFormValues,
} from '../schema'

const resolver = createZodResolver(generatePayrollEntriesSchema)

/**
 * Генерация начислений за месяц — необратимое на сервере действие, поэтому
 * запускается только по явному подтверждению с показанным периодом
 * (`CLAUDE_PAYROLL_TASK.md`: «исключи случайный повторный запуск», «не
 * утверждай количество заранее»). Число созданных записей показываем ПОСЛЕ
 * ответа сервера — из длины пришедшего массива, а не заранее.
 */
export function GeneratePayrollEntriesForm() {
  const periodId = useId()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const mutation = useGeneratePayrollEntries()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GeneratePayrollEntriesFormValues>({
    resolver,
    defaultValues: { period: currentPeriodInBishkek() },
  })

  const onPick = handleSubmit((values) => {
    setServerError(null)
    setNotice(null)
    setConfirming(values.period)
  })

  const cancel = () => {
    setConfirming(null)
  }

  const confirm = async () => {
    if (!confirming) {
      return
    }

    setServerError(null)

    try {
      const response = await mutation.mutateAsync({ period: confirming })
      const created = readPayrollEntryList(response)

      setNotice(`Создано начислений: ${created.length}.`)
      setConfirming(null)
    } catch (error) {
      setServerError(describePayrollError(error))
    }
  }

  return (
    <div className="space-y-3">
      {notice ? (
        <p role="status" className={NOTICE_CLASS}>
          {notice}
        </p>
      ) : null}

      {serverError ? (
        <p role="alert" className={ALERT_CLASS}>
          {serverError}
        </p>
      ) : null}

      {confirming ? (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            Сгенерировать начисления за {formatPeriod(confirming)}? Затронет
            всех сотрудников, у кого ещё нет начисления за этот период — точное
            число покажем после ответа сервера.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => void confirm()}
              className={PRIMARY_BUTTON_CLASS}
            >
              {mutation.isPending ? 'Генерируем…' : 'Да, сгенерировать'}
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
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={onPick}
          noValidate
        >
          <TextField
            id={periodId}
            label="Период, ГГГГ-ММ"
            placeholder="2026-09"
            error={errors.period?.message}
            {...register('period')}
          />
          <button type="submit" className={SECONDARY_BUTTON_CLASS}>
            Сгенерировать месяц
          </button>
        </form>
      )}
    </div>
  )
}

export default GeneratePayrollEntriesForm
