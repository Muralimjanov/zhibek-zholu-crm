'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { formatRole } from '@/features/auth/labels'
import { useUsersQuery } from '@/features/users/queries'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import type { KnownUserRole, User } from '@/types/auth'
import type { CreateBookingRequest } from '@/types/booking'
import {
  assignableManagerRoles,
  canListUsers,
  isActiveStaff,
  managerRequiredOnCreate,
  managerSelectableOnCreate,
} from '../access'
import { normalizeAreaInput } from '../area'
import { describeBookingError } from '../errors'
import { readBooking } from '../parse'
import { useBuyerConsentQuery, useCreateBooking } from '../queries'
import { createBookingSchema, type CreateBookingFormValues } from '../schema'
import BuyerConsent from './BuyerConsent'
import {
  ALERT_CLASS,
  ERROR_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  NOTICE_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from './section'
import TextField from './TextField'

const resolver = createZodResolver(createBookingSchema)

const EMPTY: CreateBookingFormValues = {
  fullName: '',
  passportNumber: '',
  phone: '',
  email: '',
  desiredAreaSqm: '',
  managerId: '',
  consentAccepted: false,
}

export function CreateBookingForm({
  currentUser,
  onCancel,
}: {
  currentUser: User
  onCancel: () => void
}) {
  const fullNameId = useId()
  const passportId = useId()
  const phoneId = useId()
  const emailId = useId()
  const areaId = useId()
  const managerId = useId()
  const consentId = useId()

  const managerRequired = managerRequiredOnCreate(currentUser.role)
  const managerSelectable = managerSelectableOnCreate(currentUser.role)
  const consentQuery = useBuyerConsentQuery(true)
  const usersQuery = useUsersQuery(
    managerSelectable && canListUsers(currentUser.role),
  )
  const mutation = useCreateBooking()

  const [serverError, setServerError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateBookingFormValues>({ resolver, defaultValues: EMPTY })

  // useWatch вместо watch(): watch() возвращает функцию, которую React
  // Compiler не может безопасно мемоизировать.
  const consentAccepted = useWatch({ control, name: 'consentAccepted' })

  const consentDocument = consentQuery.data ?? null
  const assignableRoles = assignableManagerRoles(currentUser.role)
  const managers = (usersQuery.data ?? []).filter(
    (item) =>
      assignableRoles.includes(item.role as KnownUserRole) &&
      isActiveStaff(item),
  )
  const creationBlocked = consentDocument === null

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    setCreatedId(null)

    // Без актуального текста согласия создавать нельзя.
    if (!consentDocument) {
      return
    }

    const area = normalizeAreaInput(values.desiredAreaSqm)

    if (!area) {
      setError('desiredAreaSqm', { message: 'Проверьте формат площади' })

      return
    }

    if (managerRequired && values.managerId === '') {
      setError('managerId', { message: 'Выберите ответственного менеджера' })

      return
    }

    const payload: CreateBookingRequest = {
      fullName: values.fullName.trim(),
      passportNumber: values.passportNumber.trim(),
      phone: values.phone.trim(),
      desiredAreaSqm: area,
      buyerConsentConfirmed: true,
      // Версию берём из ответа сервера, а не из кода.
      buyerConsentVersion: consentDocument.version,
    }

    const email = values.email.trim()

    if (email !== '') {
      payload.email = email
    }

    // Начальник продаж может оставить поле пустым — тогда сервер назначит
    // его самого; отправляем managerId, только если он явно выбран.
    if (managerSelectable && values.managerId !== '') {
      payload.managerId = values.managerId
    }

    try {
      const response = await mutation.mutateAsync(payload)

      setCreatedId(readBooking(response)?.id ?? null)
      reset(EMPTY)
    } catch (error) {
      setServerError(describeBookingError(error))
    }
  })

  return (
    <section className={SECTION_CLASS} aria-labelledby="create-booking-heading">
      <h2 id="create-booking-heading" className={SECTION_TITLE_CLASS}>
        Новая бронь
      </h2>

      <form className="mt-5 space-y-5" onSubmit={onSubmit} noValidate>
        {serverError ? (
          <p role="alert" className={ALERT_CLASS}>
            {serverError}
          </p>
        ) : null}

        {mutation.isSuccess && !serverError ? (
          <p role="status" className={NOTICE_CLASS}>
            Бронь создана.{' '}
            {createdId ? (
              <Link
                href={`/bookings/${createdId}`}
                className="font-medium underline underline-offset-4"
              >
                Открыть карточку
              </Link>
            ) : null}
          </p>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id={fullNameId}
            label="ФИО покупателя"
            disabled={isSubmitting}
            error={errors.fullName?.message}
            {...register('fullName')}
          />

          <TextField
            id={passportId}
            label="Номер паспорта"
            disabled={isSubmitting}
            autoCapitalize="characters"
            spellCheck={false}
            hint="Например: AN1234567"
            error={errors.passportNumber?.message}
            {...register('passportNumber')}
          />

          <TextField
            id={phoneId}
            label="Телефон"
            type="tel"
            disabled={isSubmitting}
            hint="Например: +996 555 12-34-56"
            error={errors.phone?.message}
            {...register('phone')}
          />

          <TextField
            id={emailId}
            label={
              <>
                Почта <span className="text-zinc-500">— необязательно</span>
              </>
            }
            type="email"
            disabled={isSubmitting}
            error={errors.email?.message}
            {...register('email')}
          />

          <TextField
            id={areaId}
            label="Желаемая площадь, м²"
            disabled={isSubmitting}
            inputMode="decimal"
            hint="Число до двух знаков: 60 или 45,5"
            error={errors.desiredAreaSqm?.message}
            {...register('desiredAreaSqm')}
          />

          {managerSelectable ? (
            <div className="space-y-1.5">
              <label htmlFor={managerId} className={LABEL_CLASS}>
                Ответственный менеджер
              </label>
              <select
                id={managerId}
                disabled={isSubmitting || usersQuery.isPending}
                className={FIELD_CLASS}
                {...register('managerId')}
              >
                <option value="">
                  {managerRequired ? 'Выберите менеджера' : 'Я (по умолчанию)'}
                </option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.fullName} ({manager.username}
                    {managerRequired ? `, ${formatRole(manager.role)}` : ''})
                  </option>
                ))}
              </select>
              {errors.managerId ? (
                <p className={ERROR_CLASS}>{errors.managerId.message}</p>
              ) : usersQuery.isError ? (
                <p className={ERROR_CLASS}>
                  Не удалось загрузить список сотрудников, выбрать менеджера
                  нельзя.
                </p>
              ) : !usersQuery.isPending &&
                managerRequired &&
                managers.length === 0 ? (
                <p className={ERROR_CLASS}>
                  Среди доступных сотрудников нет активных менеджеров по
                  продажам или начальников продаж.
                </p>
              ) : null}
            </div>
          ) : null}
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
              создать бронь сейчас нельзя.
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

        <div className="flex flex-wrap gap-2.5">
          <button
            type="submit"
            disabled={isSubmitting || creationBlocked}
            className={PRIMARY_BUTTON_CLASS}
          >
            {isSubmitting ? 'Создаём…' : 'Создать бронь'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className={SECONDARY_BUTTON_CLASS}
          >
            Отмена
          </button>
        </div>
      </form>
    </section>
  )
}

export default CreateBookingForm
