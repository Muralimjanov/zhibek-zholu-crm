'use client'

import { useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { describeConfirmationError } from '@/features/auth/error-messages'
import { useEmailCodeConfirm } from '@/features/auth/useEmailCodeConfirm'
import {
  ALERT_CLASS,
  ERROR_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import TextField from '@/features/bookings/components/TextField'
import { somToTyiyn } from '@/features/contracts/money'
import { todayInBishkek } from '@/features/shifts/date'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import type {
  CreateTransactionRequest,
  TransactionCategory,
} from '@/types/finance'
import { categoriesForType, isCategoryValidForType } from '../categories'
import { formatCategory } from '../labels'
import { useCreateTransaction } from '../queries'
import {
  createTransactionSchema,
  type CreateTransactionFormValues,
} from '../schema'

const resolver = createZodResolver(createTransactionSchema)

/**
 * Создание операции — только поля `CreateTransactionDto`
 * (`CLAUDE_FINANCE_TASK.md`). Все категории выбранного типа доступны,
 * включая `sale_deposit`/`sale_full_payment`/`sale_installment`/`payroll`:
 * опубликованная схема API 0.3.0 подтверждает, что backend не создаёт
 * операции автоматически (см. `categoriesForType`, `FINANCE_API_EXAMPLES.md`).
 * Поля `relatedContractId` нет: свободный ввод UUID договора без подборщика
 * — источник опечаток, не связывающих запись с реальным договором.
 *
 * Защищено кодом на почту (`transaction.create`) — та же двухшаговая форма,
 * что в `payroll/components/PayrollSettingsCard.tsx`: один сабмит сначала
 * запрашивает код, следующий сабмит (когда код уже запрошен) отправляет
 * саму запись.
 */
export function CreateTransactionForm({ onDone }: { onDone: () => void }) {
  const typeId = useId()
  const categoryId = useId()
  const amountId = useId()
  const dateId = useId()
  const subcategoryId = useId()
  const commentId = useId()
  const codeId = useId()

  const [code, setCode] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const challenge = useEmailCodeConfirm('transaction.create')
  const mutation = useCreateTransaction()

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateTransactionFormValues>({
    resolver,
    defaultValues: {
      type: 'expense',
      category: '',
      amount: '',
      date: todayInBishkek(),
      subcategory: '',
      comment: '',
    },
  })

  // useWatch вместо watch(): watch() возвращает функцию, которую React
  // Compiler не может безопасно мемоизировать.
  const type = useWatch({ control, name: 'type' })
  const categoryOptions = categoriesForType(type)
  const awaitingCode = challenge.phase === 'awaiting-code'

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)

    // Защита от устаревшего значения категории, если тип сменили в обход
    // сброса `onChange` ниже — категория должна принадлежать выбранному
    // типу, иначе в API уйдёт несогласованная пара.
    if (!isCategoryValidForType(values.type, values.category)) {
      setSubmitError(
        'Категория не соответствует выбранному типу. Выберите категорию заново.',
      )

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

    const amountTyiyn = somToTyiyn(values.amount)

    if (!amountTyiyn || amountTyiyn === '0') {
      setSubmitError('Проверьте формат суммы.')

      return
    }

    const payload: CreateTransactionRequest = {
      type: values.type,
      category: values.category as TransactionCategory,
      amountTyiyn,
      date: values.date,
    }

    if (values.subcategory.trim() !== '') {
      payload.subcategory = values.subcategory.trim()
    }

    if (values.comment.trim() !== '') {
      payload.comment = values.comment.trim()
    }

    try {
      await mutation.mutateAsync({
        input: payload,
        headers: challenge.headersFor(code.trim()),
      })
      onDone()
    } catch (error) {
      setSubmitError(describeConfirmationError(error))
    }
  })

  const cancel = () => {
    setCode('')
    setSubmitError(null)
    challenge.reset()
    onDone()
  }

  return (
    <section
      className={SECTION_CLASS}
      aria-labelledby="create-transaction-heading"
    >
      <h2 id="create-transaction-heading" className={SECTION_TITLE_CLASS}>
        Новая запись
      </h2>

      <form className="mt-4 space-y-4" onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={typeId} className={LABEL_CLASS}>
              Тип
            </label>
            <select
              id={typeId}
              disabled={isSubmitting || awaitingCode}
              className={FIELD_CLASS}
              {...register('type', {
                onChange: () => {
                  // Категории приходов и расходов не пересекаются — старый
                  // выбор для другого типа не должен молча долететь до API.
                  setValue('category', '')
                },
              })}
            >
              <option value="income">Приход</option>
              <option value="expense">Расход</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={categoryId} className={LABEL_CLASS}>
              Категория
            </label>
            <select
              id={categoryId}
              disabled={isSubmitting || awaitingCode}
              className={FIELD_CLASS}
              {...register('category')}
            >
              <option value="">Выберите категорию</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {formatCategory(option)}
                </option>
              ))}
            </select>
            {errors.category ? (
              <p className={ERROR_CLASS}>{errors.category.message}</p>
            ) : null}
          </div>

          <TextField
            id={amountId}
            label="Сумма, сом"
            inputMode="decimal"
            disabled={isSubmitting || awaitingCode}
            error={errors.amount?.message}
            {...register('amount')}
          />

          <TextField
            id={dateId}
            label="Дата"
            type="date"
            disabled={isSubmitting || awaitingCode}
            error={errors.date?.message}
            {...register('date')}
          />

          <TextField
            id={subcategoryId}
            label="Подкатегория"
            hint="Необязательно"
            disabled={isSubmitting || awaitingCode}
            error={errors.subcategory?.message}
            {...register('subcategory')}
          />
        </div>

        <TextField
          id={commentId}
          label="Комментарий"
          hint="Необязательно"
          disabled={isSubmitting || awaitingCode}
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
            disabled={isSubmitting}
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

        <div className="flex flex-wrap gap-2.5">
          <button
            type="submit"
            disabled={isSubmitting || challenge.phase === 'requesting'}
            className={PRIMARY_BUTTON_CLASS}
          >
            {isSubmitting
              ? 'Отправляем…'
              : awaitingCode
                ? 'Подтвердить и создать'
                : 'Запросить код'}
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
    </section>
  )
}

export default CreateTransactionForm
