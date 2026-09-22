'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { BuyerConsent } from '@/features/bookings/components/BuyerConsent'
import {
  ALERT_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  NOTICE_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import { useBuyerConsentQuery } from '@/features/bookings/queries'
import { describeApiError } from '@/features/auth/error-messages'
import { normalizeAreaInput } from '@/features/bookings/area'
import { createLead } from '../api'

interface FormState {
  firstName: string
  lastName: string
  phone: string
  desiredAreaSqm: string
  comment: string
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  phone: '',
  desiredAreaSqm: '',
  comment: '',
}

/**
 * Форма ресепшена: записываем обращение со слов клиента.
 *
 * Полей ровно четыре — имя, фамилия, телефон и нужная площадь — чтобы
 * заполнение занимало секунды, пока человек стоит у стойки или ждёт на
 * линии. Согласие на обработку персональных данных клиент подтверждает
 * здесь же: без него эти данные в базу не попадут.
 *
 * После отправки форма очищается и остаётся готовой к следующему
 * обращению — за смену их бывает много подряд.
 */
export default function LeadForm() {
  const fieldId = useId()
  const queryClient = useQueryClient()
  const consentQuery = useBuyerConsentQuery(true)
  const consentDocument = consentQuery.data ?? null

  const [values, setValues] = useState<FormState>(EMPTY)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [savedName, setSavedName] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createLead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })

  const set = (key: keyof FormState) => (value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setFieldError(null)
    setServerError(null)
    setSavedName(null)

    if (!consentDocument) {
      return
    }

    const firstName = values.firstName.trim()
    const lastName = values.lastName.trim()
    const phone = values.phone.trim()

    if (firstName === '' || lastName === '') {
      setFieldError('Укажите имя и фамилию клиента.')

      return
    }
    if (phone.length < 5) {
      setFieldError('Укажите номер телефона — по нему перезвонит менеджер.')

      return
    }

    const area = normalizeAreaInput(values.desiredAreaSqm)

    if (!area) {
      setFieldError('Укажите площадь в квадратных метрах, например 72,5.')

      return
    }
    if (!consentAccepted) {
      setFieldError('Клиент должен подтвердить согласие на обработку данных.')

      return
    }

    mutation.mutate(
      {
        firstName,
        lastName,
        phone,
        desiredAreaSqm: area,
        ...(values.comment.trim() === '' ? {} : { comment: values.comment.trim() }),
        buyerConsentConfirmed: true,
        buyerConsentVersion: consentDocument.version,
      },
      {
        onSuccess: () => {
          setSavedName(`${lastName} ${firstName}`)
          setValues(EMPTY)
          setConsentAccepted(false)
        },
        onError: (error) => {
          setServerError(describeApiError(error))
        },
      },
    )
  }

  const busy = mutation.isPending || consentQuery.isPending

  return (
    <form onSubmit={handleSubmit} className={SECTION_CLASS}>
      <h2 className={SECTION_TITLE_CLASS}>Новое обращение</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Запишите клиента — менеджер перезвонит.
      </p>

      {savedName ? (
        <p className={`${NOTICE_CLASS} mt-4`} role="status">
          Обращение записано: {savedName}. Можно вводить следующее.
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS} htmlFor={`${fieldId}-last`}>
            Фамилия
          </label>
          <input
            id={`${fieldId}-last`}
            className={`${FIELD_CLASS} mt-1`}
            value={values.lastName}
            onChange={(event) => set('lastName')(event.target.value)}
            disabled={busy}
            autoComplete="off"
            required
          />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor={`${fieldId}-first`}>
            Имя
          </label>
          <input
            id={`${fieldId}-first`}
            className={`${FIELD_CLASS} mt-1`}
            value={values.firstName}
            onChange={(event) => set('firstName')(event.target.value)}
            disabled={busy}
            autoComplete="off"
            required
          />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor={`${fieldId}-phone`}>
            Телефон
          </label>
          <input
            id={`${fieldId}-phone`}
            className={`${FIELD_CLASS} mt-1`}
            value={values.phone}
            onChange={(event) => set('phone')(event.target.value)}
            disabled={busy}
            inputMode="tel"
            autoComplete="off"
            placeholder="+996 555 12-34-56"
            required
          />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor={`${fieldId}-area`}>
            Нужно квадратных метров
          </label>
          <input
            id={`${fieldId}-area`}
            className={`${FIELD_CLASS} mt-1`}
            value={values.desiredAreaSqm}
            onChange={(event) => set('desiredAreaSqm')(event.target.value)}
            disabled={busy}
            inputMode="decimal"
            autoComplete="off"
            placeholder="72,5"
            required
          />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor={`${fieldId}-comment`}>
            Комментарий (необязательно)
          </label>
          <textarea
            id={`${fieldId}-comment`}
            className={`${FIELD_CLASS} mt-1`}
            rows={2}
            value={values.comment}
            onChange={(event) => set('comment')(event.target.value)}
            disabled={busy}
            placeholder="Например: просит перезвонить после 18:00"
          />
        </div>
      </div>

      {consentDocument ? (
        <div className="mt-4">
          <BuyerConsent
            document={consentDocument}
            checked={consentAccepted}
            onChange={setConsentAccepted}
            disabled={busy}
            checkboxId={`${fieldId}-consent`}
          />
        </div>
      ) : (
        <p className={`${ALERT_CLASS} mt-4`} role="alert">
          Текст согласия не загрузился — записать обращение нельзя. Обновите
          страницу.
        </p>
      )}

      {fieldError ? (
        <p className={`${ALERT_CLASS} mt-4`} role="alert">
          {fieldError}
        </p>
      ) : null}
      {serverError ? (
        <p className={`${ALERT_CLASS} mt-4`} role="alert">
          {serverError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || !consentDocument}
        className={`${PRIMARY_BUTTON_CLASS} mt-4 w-full sm:w-auto`}
      >
        {mutation.isPending ? 'Записываем…' : 'Записать обращение'}
      </button>
    </form>
  )
}
