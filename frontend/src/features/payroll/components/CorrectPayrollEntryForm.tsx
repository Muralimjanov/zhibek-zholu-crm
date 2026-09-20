'use client'

import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  ALERT_CLASS,
  NOTICE_CLASS,
  PRIMARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'
import TextField from '@/features/bookings/components/TextField'
import { somToTyiyn } from '@/features/contracts/money'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import type { CorrectPayrollEntryRequest } from '@/types/payroll'
import { describePayrollError } from '../errors'
import type { useCorrectPayrollEntry } from '../queries'
import {
  correctPayrollEntrySchema,
  type CorrectPayrollEntryFormValues,
} from '../schema'

const resolver = createZodResolver(correctPayrollEntrySchema)

/**
 * Ручная коррекция черновика — только `baseSalaryTyiyn`/`fineAmountTyiyn`,
 * никаких других полей DTO не отправляем (`CLAUDE_PAYROLL_TASK.md`). Пустое
 * поле — «не менять», а не «обнулить»: отправляем только заполненные поля,
 * как в `contracts/EditContractForm`.
 *
 * `mutation` поднята в `PayrollEntryDetail`, а не создаётся здесь: та же
 * мутация и признак несохранённого ввода (`onDirtyChange`) нужны соседнему
 * `PayrollEntryConfirm`, чтобы не дать подтвердить начисление, пока
 * коррекция сохраняется или ещё не сохранена — иначе пользователь мог бы
 * незаметно подтвердить старую сумму.
 *
 * `disabled` — обратное направление той же блокировки: пока рядом выполняется
 * `POST /confirm` (или запись перезапрашивается после него), править поля и
 * отправлять `PATCH` той же записи нельзя — сервер и так откажет 409 на уже
 * подтверждённой записи, но начатый одновременно запрос коррекции мог бы
 * долететь до сервера в промежутке между подтверждением и обновлением кеша.
 */
export function CorrectPayrollEntryForm({
  mutation,
  disabled,
  onDirtyChange,
}: {
  mutation: ReturnType<typeof useCorrectPayrollEntry>
  disabled: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const baseSalaryId = useId()
  const fineAmountId = useId()
  const [serverError, setServerError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CorrectPayrollEntryFormValues>({
    resolver,
    defaultValues: { baseSalary: '', fineAmount: '' },
  })

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    setNotice(null)

    // Кнопка ниже и так дизейблится через `disabled`, это защита от гонки
    // состояний — например, если подтверждение стартовало уже после того,
    // как форма была открыта.
    if (disabled) {
      setServerError('Начисление сейчас подтверждается — дождитесь завершения.')

      return
    }

    const payload: CorrectPayrollEntryRequest = {}

    if (values.baseSalary.trim() !== '') {
      const baseSalaryTyiyn = somToTyiyn(values.baseSalary)

      if (!baseSalaryTyiyn) {
        setError('baseSalary', { message: 'Проверьте формат оклада' })

        return
      }

      payload.baseSalaryTyiyn = baseSalaryTyiyn
    }

    if (values.fineAmount.trim() !== '') {
      const fineAmountTyiyn = somToTyiyn(values.fineAmount)

      if (!fineAmountTyiyn) {
        setError('fineAmount', { message: 'Проверьте формат штрафа' })

        return
      }

      payload.fineAmountTyiyn = fineAmountTyiyn
    }

    if (Object.keys(payload).length === 0) {
      setNotice('Введите значение, которое нужно изменить.')

      return
    }

    try {
      await mutation.mutateAsync(payload)
      reset()
      setNotice('Изменения сохранены.')
    } catch (error) {
      setServerError(describePayrollError(error))
    }
  })

  return (
    <form className="space-y-3" onSubmit={onSubmit} noValidate>
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

      {disabled ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Начисление сейчас подтверждается — правка недоступна.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id={baseSalaryId}
          label="Новый оклад, сом"
          inputMode="decimal"
          hint="Оставьте пустым, чтобы не менять"
          disabled={isSubmitting || disabled}
          error={errors.baseSalary?.message}
          {...register('baseSalary')}
        />
        <TextField
          id={fineAmountId}
          label="Новый штраф, сом"
          inputMode="decimal"
          hint="Оставьте пустым, чтобы не менять"
          disabled={isSubmitting || disabled}
          error={errors.fineAmount?.message}
          {...register('fineAmount')}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting || disabled}
        className={PRIMARY_BUTTON_CLASS}
      >
        {isSubmitting ? 'Сохраняем…' : 'Сохранить коррекцию'}
      </button>
    </form>
  )
}

export default CorrectPayrollEntryForm
