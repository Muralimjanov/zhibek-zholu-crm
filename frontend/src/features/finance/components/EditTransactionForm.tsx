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
} from '@/features/bookings/components/section'
import TextField from '@/features/bookings/components/TextField'
import { somToTyiyn } from '@/features/contracts/money'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import type { Transaction, UpdateTransactionRequest } from '@/types/finance'
import type { useUpdateTransaction } from '../queries'
import {
  editTransactionSchema,
  type EditTransactionFormValues,
} from '../schema'

const resolver = createZodResolver(editTransactionSchema)

/** "5000000" тыйын → "50000" сом — тот же приём, что в `contracts/EditContractForm`. */
function tyiynToSomInput(value: string | null): string {
  if (!value) {
    return ''
  }

  const digits = value.padStart(3, '0')
  const whole = digits.slice(0, -2).replace(/^0+(?=\d)/, '') || '0'
  const fraction = digits.slice(-2)

  return fraction === '00' ? whole : `${whole}.${fraction}`
}

function toFormValues(transaction: Transaction): EditTransactionFormValues {
  return {
    amount: tyiynToSomInput(transaction.amountTyiyn),
    date: transaction.date ?? '',
    subcategory: transaction.subcategory ?? '',
    comment: transaction.comment ?? '',
  }
}

/**
 * Диф с исходной записью: отсутствие поля в `PATCH` — «не менять», явный
 * `null` — очистка nullable-поля (`CLAUDE_FINANCE_TASK.md`). Пустая строка в
 * поле, которое раньше было заполнено, — это и есть просьба очистить.
 * `relatedContractId` в форме нет и в payload никогда не попадает — свободный
 * ввод UUID договора убран, существующая связь сохраняется как есть.
 */
function buildDiff(
  transaction: Transaction,
  values: EditTransactionFormValues,
): UpdateTransactionRequest | null {
  const payload: UpdateTransactionRequest = {}

  const amountTyiyn = somToTyiyn(values.amount)

  if (!amountTyiyn || amountTyiyn === '0') {
    return null
  }

  if (amountTyiyn !== transaction.amountTyiyn) {
    payload.amountTyiyn = amountTyiyn
  }

  if (values.date !== (transaction.date ?? '')) {
    payload.date = values.date
  }

  const subcategory = values.subcategory.trim()

  if (subcategory !== (transaction.subcategory ?? '')) {
    payload.subcategory = subcategory === '' ? null : subcategory
  }

  const comment = values.comment.trim()

  if (comment !== (transaction.comment ?? '')) {
    payload.comment = comment === '' ? null : comment
  }

  return payload
}

/**
 * Правка допустимых полей — защищено кодом на почту (`transaction.update`,
 * `resourceId: id`). `mutation` и `disabled` подняты в `TransactionCard`:
 * пока идёт загрузка вложения той же записи (или она перезапрашивается),
 * править нельзя — оба действия на одной записи не должны идти одновременно.
 */
export function EditTransactionForm({
  transaction,
  mutation,
  disabled,
}: {
  transaction: Transaction
  mutation: ReturnType<typeof useUpdateTransaction>
  disabled: boolean
}) {
  const amountId = useId()
  const dateId = useId()
  const subcategoryId = useId()
  const commentId = useId()
  const codeId = useId()

  const [code, setCode] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const challenge = useEmailCodeConfirm('transaction.update', transaction.id)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditTransactionFormValues>({
    resolver,
    defaultValues: toFormValues(transaction),
  })

  const awaitingCode = challenge.phase === 'awaiting-code'
  const blocked = disabled || isSubmitting

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    setNotice(null)

    const payload = buildDiff(transaction, values)

    if (!payload) {
      setSubmitError('Проверьте формат суммы.')

      return
    }

    if (Object.keys(payload).length === 0) {
      setNotice('Изменений нет.')

      return
    }

    if (!awaitingCode) {
      await challenge.requestCode()

      return
    }

    if (code.trim() === '') {
      setSubmitError('Введите код из письма.')

      return
    }

    try {
      await mutation.mutateAsync({
        input: payload,
        headers: challenge.headersFor(code.trim()),
      })
      // Только что сохранённые значения становятся новой базой для isDirty —
      // без этого следующее открытие формы показывало бы значения на момент
      // монтирования карточки, а не то, что реально сохранено (тот же баг,
      // что был исправлен в `payroll/PayrollSettingsCard.tsx`).
      reset(values)
      setCode('')
      challenge.reset()
      setNotice('Изменения сохранены.')
    } catch (error) {
      setSubmitError(describeConfirmationError(error))
    }
  })

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      {notice ? (
        <p role="status" className={NOTICE_CLASS}>
          {notice}
        </p>
      ) : null}

      {disabled ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Загружается вложение — правка временно недоступна.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={amountId}
          label="Сумма, сом"
          inputMode="decimal"
          disabled={blocked || awaitingCode}
          error={errors.amount?.message}
          {...register('amount')}
        />
        <TextField
          id={dateId}
          label="Дата"
          type="date"
          disabled={blocked || awaitingCode}
          error={errors.date?.message}
          {...register('date')}
        />
        <TextField
          id={subcategoryId}
          label="Подкатегория"
          hint="Оставьте пустым, чтобы очистить"
          disabled={blocked || awaitingCode}
          error={errors.subcategory?.message}
          {...register('subcategory')}
        />
      </div>

      <TextField
        id={commentId}
        label="Комментарий"
        hint="Оставьте пустым, чтобы очистить"
        disabled={blocked || awaitingCode}
        error={errors.comment?.message}
        {...register('comment')}
      />

      {challenge.phase === 'requesting' ? (
        <p role="status" className="text-sm text-zinc-500">
          Отправляем код на почту…
        </p>
      ) : awaitingCode ? (
        <p role="status" className="text-sm text-zinc-500">
          Код подтверждения отправлен на вашу почту.
        </p>
      ) : null}

      {challenge.error ? (
        <p role="alert" className={ALERT_CLASS}>
          {challenge.error}
        </p>
      ) : null}

      {awaitingCode ? (
        <TextField
          id={codeId}
          label="Код из письма"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          disabled={blocked}
          value={code}
          onChange={(event) => {
            setCode(event.target.value)
          }}
        />
      ) : null}

      {submitError ? (
        <p role="alert" className={ERROR_CLASS}>
          {submitError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={blocked || challenge.phase === 'requesting'}
        className={PRIMARY_BUTTON_CLASS}
      >
        {isSubmitting
          ? 'Сохраняем…'
          : awaitingCode
            ? 'Подтвердить и сохранить'
            : 'Сохранить изменения'}
      </button>
    </form>
  )
}

export default EditTransactionForm
