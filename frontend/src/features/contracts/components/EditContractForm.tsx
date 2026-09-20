'use client'

import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  ALERT_CLASS,
  ERROR_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  NOTICE_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'
import TextField from '@/features/bookings/components/TextField'
import { formatRole } from '@/features/auth/labels'
import { useUsersQuery } from '@/features/users/queries'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import type { KnownUserRole, UserRole } from '@/types/auth'
import type { Contract, UpdateContractRequest } from '@/types/contract'
import {
  assignableManagerRoles,
  canListUsers,
  canReassignManager,
  isActiveStaff,
} from '../access'
import { describeContractError } from '../errors'
import { normalizeDecimal2Input, somToTyiyn } from '../money'
import { useUpdateContract } from '../queries'
import { editContractSchema, type EditContractFormValues } from '../schema'

const resolver = createZodResolver(editContractSchema)

/** "5000000" тыйын → "50000" сом, для поля ввода. */
function tyiynToSomInput(value: string | null): string {
  if (!value) {
    return ''
  }

  const digits = value.padStart(3, '0')
  const whole = digits.slice(0, -2).replace(/^0+(?=\d)/, '') || '0'
  const fraction = digits.slice(-2)

  return fraction === '00' ? whole : `${whole}.${fraction}`
}

function toFormValues(contract: Contract): EditContractFormValues {
  return {
    fullName: contract.fullName ?? '',
    passportNumber: contract.passportNumber ?? '',
    phone: contract.phone ?? '',
    email: contract.email ?? '',
    address: contract.address ?? '',
    areaSqm: contract.areaSqm ?? '',
    pricePerSqm: tyiynToSomInput(contract.pricePerSqmTyiyn),
    depositPercent: contract.depositPercent ?? '',
    managerId: contract.managerId ?? '',
  }
}

interface EditContractFormProps {
  contract: Contract
  role: UserRole
  currentUserId: string
  onDone: () => void
}

export function EditContractForm({
  contract,
  role,
  currentUserId,
  onDone,
}: EditContractFormProps) {
  const fullNameId = useId()
  const passportId = useId()
  const phoneId = useId()
  const emailId = useId()
  const addressId = useId()
  const areaId = useId()
  const priceId = useId()
  const depositId = useId()
  const managerFieldId = useId()

  const canReassign = canReassignManager(role)
  const usersQuery = useUsersQuery(canReassign && canListUsers(role))
  const mutation = useUpdateContract(contract.id)

  const [serverError, setServerError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditContractFormValues>({
    resolver,
    defaultValues: toFormValues(contract),
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

    const area = normalizeDecimal2Input(values.areaSqm)
    const pricePerSqmTyiyn = somToTyiyn(values.pricePerSqm)

    if (!area) {
      setError('areaSqm', { message: 'Проверьте формат площади' })

      return
    }

    if (!pricePerSqmTyiyn) {
      setError('pricePerSqm', { message: 'Проверьте формат цены' })

      return
    }

    // Отправляем только изменённые и разрешённые поля.
    const payload: UpdateContractRequest = {}
    const fullName = values.fullName.trim()
    const passportNumber = values.passportNumber.trim()
    const phone = values.phone.trim()
    const email = values.email.trim() === '' ? null : values.email.trim()
    const address = values.address.trim()

    if (fullName !== (contract.fullName ?? '')) {
      payload.fullName = fullName
    }

    if (passportNumber !== (contract.passportNumber ?? '')) {
      payload.passportNumber = passportNumber
    }

    if (phone !== (contract.phone ?? '')) {
      payload.phone = phone
    }

    if (email !== contract.email) {
      payload.email = email
    }

    if (address !== (contract.address ?? '')) {
      payload.address = address
    }

    if (area !== contract.areaSqm) {
      payload.areaSqm = area
    }

    if (pricePerSqmTyiyn !== contract.pricePerSqmTyiyn) {
      payload.pricePerSqmTyiyn = pricePerSqmTyiyn
    }

    const depositPercent = normalizeDecimal2Input(values.depositPercent)

    if (depositPercent && depositPercent !== contract.depositPercent) {
      payload.depositPercent = depositPercent
    }

    if (
      canReassign &&
      values.managerId !== '' &&
      values.managerId !== (contract.managerId ?? '')
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
      setServerError(describeContractError(error))
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
          id={addressId}
          label="Адрес объекта"
          disabled={isSubmitting}
          error={errors.address?.message}
          {...register('address')}
        />
        <TextField
          id={areaId}
          label="Площадь, м²"
          disabled={isSubmitting}
          inputMode="decimal"
          error={errors.areaSqm?.message}
          {...register('areaSqm')}
        />
        <TextField
          id={priceId}
          label="Цена за м², сом"
          disabled={isSubmitting}
          inputMode="decimal"
          error={errors.pricePerSqm?.message}
          {...register('pricePerSqm')}
        />
        <TextField
          id={depositId}
          label="Процент взноса"
          disabled={isSubmitting}
          inputMode="decimal"
          error={errors.depositPercent?.message}
          {...register('depositPercent')}
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
            reset(toFormValues(contract))
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

export default EditContractForm
