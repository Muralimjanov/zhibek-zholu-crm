'use client'

import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { formatRole } from '@/features/auth/labels'
import { useUsersQuery } from '@/features/users/queries'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import type { KnownUserRole, UserRole } from '@/types/auth'
import type { Booking, UpdateBookingRequest } from '@/types/booking'
import {
  assignableManagerRoles,
  canListUsers,
  canReassignManager,
  isActiveStaff,
} from '../access'
import { normalizeAreaInput } from '../area'
import { describeBookingError } from '../errors'
import { useUpdateBooking } from '../queries'
import { editBookingSchema, type EditBookingFormValues } from '../schema'
import {
  ALERT_CLASS,
  ERROR_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  NOTICE_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from './section'
import TextField from './TextField'

const resolver = createZodResolver(editBookingSchema)

function toFormValues(booking: Booking): EditBookingFormValues {
  return {
    fullName: booking.fullName ?? '',
    passportNumber: booking.passportNumber ?? '',
    phone: booking.phone ?? '',
    email: booking.email ?? '',
    desiredAreaSqm: booking.desiredAreaSqm ?? '',
    managerId: booking.managerId ?? '',
  }
}

interface EditBookingFormProps {
  booking: Booking
  role: UserRole
  currentUserId: string
  onDone: () => void
}

export function EditBookingForm({
  booking,
  role,
  currentUserId,
  onDone,
}: EditBookingFormProps) {
  const fullNameId = useId()
  const passportId = useId()
  const phoneId = useId()
  const emailId = useId()
  const areaId = useId()
  const managerFieldId = useId()

  const canReassign = canReassignManager(role)
  const usersQuery = useUsersQuery(canReassign && canListUsers(role))
  const mutation = useUpdateBooking(booking.id)

  const [serverError, setServerError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditBookingFormValues>({
    resolver,
    defaultValues: toFormValues(booking),
  })

  const assignableRoles = assignableManagerRoles(role)
  const managers = (usersQuery.data ?? []).filter(
    (item) =>
      assignableRoles.includes(item.role as KnownUserRole) &&
      isActiveStaff(item),
  )
  // Начальник продаж не входит в GET /users своей команды — добавляем себя
  // как обычный вариант выбора, а не подставляем молча при пустом значении:
  // здесь пусто значит «не менять», а не «назначить себя».
  const canSelectSelf = role === 'head_of_sales'

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    setNotice(null)

    const area = normalizeAreaInput(values.desiredAreaSqm)

    if (!area) {
      setError('desiredAreaSqm', { message: 'Проверьте формат площади' })

      return
    }

    // Отправляем только изменённые и разрешённые поля.
    const payload: UpdateBookingRequest = {}
    const fullName = values.fullName.trim()
    const passportNumber = values.passportNumber.trim()
    const phone = values.phone.trim()
    const email = values.email.trim() === '' ? null : values.email.trim()

    if (fullName !== (booking.fullName ?? '')) {
      payload.fullName = fullName
    }

    if (passportNumber !== (booking.passportNumber ?? '')) {
      payload.passportNumber = passportNumber
    }

    if (phone !== (booking.phone ?? '')) {
      payload.phone = phone
    }

    if (email !== booking.email) {
      payload.email = email
    }

    if (area !== booking.desiredAreaSqm) {
      payload.desiredAreaSqm = area
    }

    if (
      canReassign &&
      values.managerId !== '' &&
      values.managerId !== (booking.managerId ?? '')
    ) {
      payload.managerId = values.managerId
    }

    if (Object.keys(payload).length === 0) {
      setNotice('Изменений нет.')

      return
    }

    try {
      await mutation.mutateAsync(payload)
      setNotice('Изменения сохранены.')
      onDone()
    } catch (error) {
      // Введённое не сбрасываем.
      setServerError(describeBookingError(error))
    }
  })

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
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
          error={errors.passportNumber?.message}
          {...register('passportNumber')}
        />
        <TextField
          id={phoneId}
          label="Телефон"
          type="tel"
          disabled={isSubmitting}
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          id={emailId}
          label="Почта"
          type="email"
          disabled={isSubmitting}
          hint="Оставьте пустым, чтобы удалить почту"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          id={areaId}
          label="Желаемая площадь, м²"
          disabled={isSubmitting}
          inputMode="decimal"
          error={errors.desiredAreaSqm?.message}
          {...register('desiredAreaSqm')}
        />

        {canReassign ? (
          <div className="space-y-1.5">
            <label htmlFor={managerFieldId} className={LABEL_CLASS}>
              Ответственный менеджер
            </label>
            <select
              id={managerFieldId}
              disabled={isSubmitting || usersQuery.isPending}
              className={FIELD_CLASS}
              {...register('managerId')}
            >
              <option value="">Не менять</option>
              {canSelectSelf ? <option value={currentUserId}>Я</option> : null}
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.fullName} ({manager.username}
                  {role === 'director' ? `, ${formatRole(manager.role)}` : ''})
                </option>
              ))}
            </select>
            {usersQuery.isError ? (
              <p className={ERROR_CLASS}>
                Список сотрудников не загрузился — переназначить нельзя.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isSubmitting ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => {
            reset(toFormValues(booking))
            setServerError(null)
            setNotice(null)
            onDone()
          }}
          className={SECONDARY_BUTTON_CLASS}
        >
          Отменить правку
        </button>
      </div>
    </form>
  )
}

export default EditBookingForm
