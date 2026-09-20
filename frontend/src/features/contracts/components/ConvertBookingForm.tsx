'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import BuyerConsent from '@/features/bookings/components/BuyerConsent'
import {
  ALERT_CLASS,
  NOTICE_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import TextField from '@/features/bookings/components/TextField'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import type { ConvertBookingRequest } from '@/types/contract'
import { describeContractError } from '../errors'
import { normalizeDecimal2Input, somToTyiyn } from '../money'
import { readContract } from '../parse'
import { useBuyerConsentQuery, useConvertBooking } from '../queries'
import { convertBookingSchema, type ConvertBookingFormValues } from '../schema'

const EMPTY: ConvertBookingFormValues = {
  address: '',
  pricePerSqm: '',
  depositPercent: '',
  consentAccepted: false,
}

const resolver = createZodResolver(convertBookingSchema)

/**
 * Конвертация активной брони в договор. Данные покупателя уже есть в
 * брони — здесь нужны только условия сделки: адрес, цена, процент взноса и
 * повторное явное согласие (версия документа могла обновиться).
 */
export function ConvertBookingForm({
  bookingId,
  onDone,
}: {
  bookingId: string
  onDone: () => void
}) {
  const addressId = useId()
  const priceId = useId()
  const depositId = useId()
  const consentId = useId()

  const consentQuery = useBuyerConsentQuery(true)
  const mutation = useConvertBooking(bookingId)

  const [serverError, setServerError] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ConvertBookingFormValues>({ resolver, defaultValues: EMPTY })

  const consentAccepted = useWatch({ control, name: 'consentAccepted' })
  const consentDocument = consentQuery.data ?? null
  const blocked = consentDocument === null

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)

    if (!consentDocument) {
      return
    }

    const pricePerSqmTyiyn = somToTyiyn(values.pricePerSqm)

    if (!pricePerSqmTyiyn) {
      setError('pricePerSqm', { message: 'Проверьте формат цены' })

      return
    }

    const payload: ConvertBookingRequest = {
      address: values.address.trim(),
      pricePerSqmTyiyn,
      buyerConsentConfirmed: true,
      buyerConsentVersion: consentDocument.version,
    }

    const depositPercent = normalizeDecimal2Input(values.depositPercent)

    if (depositPercent) {
      payload.depositPercent = depositPercent
    }

    try {
      const response = await mutation.mutateAsync(payload)

      // HTTP-запрос уже успешен — успех фиксируем независимо от того,
      // распознан ли `id` в ответе. Иначе форма осталась бы активной и
      // повторная отправка ушла бы в уже сконвертированную бронь как 409.
      setSucceeded(true)
      setCreatedId(readContract(response)?.id ?? null)
    } catch (error) {
      setServerError(describeContractError(error))
    }
  })

  if (succeeded) {
    return (
      <section className={SECTION_CLASS} aria-labelledby="convert-done-heading">
        <h2 id="convert-done-heading" className={SECTION_TITLE_CLASS}>
          Договор оформлен
        </h2>
        <p role="status" className={`mt-3 ${NOTICE_CLASS}`}>
          Бронь переведена в договор.{' '}
          {createdId ? (
            <Link
              href={`/contracts/${createdId}`}
              className="font-medium underline underline-offset-4"
            >
              Открыть договор
            </Link>
          ) : (
            <Link
              href="/contracts"
              className="font-medium underline underline-offset-4"
            >
              Открыть список договоров
            </Link>
          )}
        </p>
      </section>
    )
  }

  return (
    <section className={SECTION_CLASS} aria-labelledby="convert-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="convert-heading" className={SECTION_TITLE_CLASS}>
          Оформить в договор
        </h2>
        <button
          type="button"
          onClick={onDone}
          className={SECONDARY_BUTTON_CLASS}
        >
          Скрыть
        </button>
      </div>

      <form className="mt-5 space-y-5" onSubmit={onSubmit} noValidate>
        {serverError ? (
          <p role="alert" className={ALERT_CLASS}>
            {serverError}
          </p>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id={addressId}
            label="Адрес объекта"
            disabled={isSubmitting}
            error={errors.address?.message}
            {...register('address')}
          />

          <TextField
            id={priceId}
            label="Цена за м², сом"
            disabled={isSubmitting}
            inputMode="decimal"
            hint="Например: 50000"
            error={errors.pricePerSqm?.message}
            {...register('pricePerSqm')}
          />

          <TextField
            id={depositId}
            label={
              <>
                Процент взноса{' '}
                <span className="text-zinc-500">— по умолчанию 30</span>
              </>
            }
            disabled={isSubmitting}
            inputMode="decimal"
            error={errors.depositPercent?.message}
            {...register('depositPercent')}
          />
        </div>

        {consentQuery.isPending ? (
          <p role="status" className="text-sm text-zinc-500">
            Загружаем форму согласия покупателя…
          </p>
        ) : consentDocument ? (
          <BuyerConsent
            document={consentDocument}
            checkboxId={consentId}
            checked={consentAccepted ?? false}
            disabled={isSubmitting}
            error={errors.consentAccepted?.message}
            onChange={(value) => {
              setValue('consentAccepted', value, { shouldValidate: true })
            }}
          />
        ) : (
          <div className={ALERT_CLASS} role="alert">
            <p>
              Не удалось загрузить актуальный текст согласия покупателя, поэтому
              оформить договор сейчас нельзя.
            </p>
            <button
              type="button"
              onClick={() => void consentQuery.refetch()}
              className={`mt-3 ${SECONDARY_BUTTON_CLASS}`}
            >
              Повторить загрузку
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || blocked}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isSubmitting ? 'Оформляем…' : 'Оформить договор'}
        </button>
      </form>
    </section>
  )
}

export default ConvertBookingForm
