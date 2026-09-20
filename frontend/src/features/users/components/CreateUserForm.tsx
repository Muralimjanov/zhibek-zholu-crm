'use client'

import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { formatRole } from '@/features/auth/labels'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import type { KnownUserRole, UserRole } from '@/types/auth'
import type { CreateUserRequest } from '@/types/users'
import { creatableRoles } from '../access'
import { describeCreateUserError } from '../errors'
import {
  describeEmailDelivery,
  readEmailDelivery,
  readPendingActionId,
  type EmailDeliveryNotice,
} from '../pending'
import { useRequestUserCreation } from '../queries'
import { createUserSchema, type CreateUserFormValues } from '../schema'
import {
  FIELD_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from './section'

const resolver = createZodResolver(createUserSchema)

interface Accepted {
  pendingActionId: string | null
  delivery: EmailDeliveryNotice
}

const NOTICE_TONE_CLASS = {
  ok: 'border-zinc-200 bg-surface-muted text-zinc-700 dark:border-zinc-800 dark:text-zinc-300',
  warn: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  unknown:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
} as const

export function CreateUserForm({ currentRole }: { currentRole: UserRole }) {
  const usernameId = useId()
  const passwordId = useId()
  const fullNameId = useId()
  const phoneId = useId()
  const emailId = useId()
  const roleId = useId()

  const roles = creatableRoles(currentRole)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<Accepted | null>(null)
  const mutation = useRequestUserCreation()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver,
    defaultValues: {
      username: '',
      password: '',
      fullName: '',
      phone: '',
      email: '',
      role: roles[0] ?? '',
    },
  })

  if (roles.length === 0) {
    return null
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    setAccepted(null)

    if (!roles.includes(values.role as KnownUserRole)) {
      setServerError('Выберите роль из списка доступных.')

      return
    }

    // В тело уходят только поля контракта; пустые необязательные не отправляем.
    // email обязателен с API 0.2.0 — на него придёт код входа сотрудника.
    const payload: CreateUserRequest = {
      username: values.username.trim(),
      password: values.password,
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      role: values.role as KnownUserRole,
    }

    const phone = values.phone.trim()

    if (phone !== '') {
      payload.phone = phone
    }

    try {
      const response = await mutation.mutateAsync(payload)

      setAccepted({
        pendingActionId: readPendingActionId(response),
        delivery: describeEmailDelivery(readEmailDelivery(response)),
      })
      // Пароль не оставляем в форме.
      reset({
        username: '',
        password: '',
        fullName: '',
        phone: '',
        email: '',
        role: roles[0] ?? '',
      })
    } catch (error) {
      setServerError(describeCreateUserError(error))
    }
  })

  const isSubmitting = mutation.isPending

  return (
    <section className={SECTION_CLASS} aria-labelledby="create-user-heading">
      <h2 id="create-user-heading" className={SECTION_TITLE_CLASS}>
        Запрос на создание аккаунта
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {currentRole === 'director'
          ? 'Аккаунт появится только после того, как вы подтвердите запрос кодом из письма.'
          : 'Аккаунт появится только после подтверждения директором: код придёт ему на почту.'}
      </p>

      <form className="mt-5 space-y-5" onSubmit={onSubmit} noValidate>
        {serverError ? (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {serverError}
          </p>
        ) : null}

        {accepted ? (
          <div role="status" className="space-y-2">
            <p className="rounded-lg border border-zinc-200 bg-surface-muted px-3 py-2 text-sm text-zinc-800 dark:border-zinc-800 dark:text-zinc-200">
              Запрос отправлен на подтверждение. Аккаунт ещё не создан.
              {accepted.pendingActionId
                ? ` Номер запроса: ${accepted.pendingActionId}.`
                : ''}
            </p>
            <p
              className={`rounded-lg border px-3 py-2 text-sm ${NOTICE_TONE_CLASS[accepted.delivery.tone]}`}
            >
              {accepted.delivery.message}
            </p>
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor={fullNameId}
              className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              ФИО
            </label>
            <input
              id={fullNameId}
              type="text"
              disabled={isSubmitting}
              aria-invalid={errors.fullName ? true : undefined}
              className={FIELD_CLASS}
              {...register('fullName')}
            />
            {errors.fullName ? (
              <p className="text-sm text-red-700 dark:text-red-400">
                {errors.fullName.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={roleId}
              className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Роль
            </label>
            <select
              id={roleId}
              disabled={isSubmitting}
              className={FIELD_CLASS}
              {...register('role')}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {formatRole(role)}
                </option>
              ))}
            </select>
            {errors.role ? (
              <p className="text-sm text-red-700 dark:text-red-400">
                {errors.role.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={usernameId}
              className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Логин
            </label>
            <input
              id={usernameId}
              type="text"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
              disabled={isSubmitting}
              aria-invalid={errors.username ? true : undefined}
              aria-describedby={`${usernameId}-hint`}
              className={FIELD_CLASS}
              {...register('username')}
            />
            {errors.username ? (
              <p className="text-sm text-red-700 dark:text-red-400">
                {errors.username.message}
              </p>
            ) : (
              <p
                id={`${usernameId}-hint`}
                className="text-xs text-zinc-500 dark:text-zinc-400"
              >
                3–64 символа: латиница, цифры, «.», «_», «-».
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={passwordId}
              className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Пароль
            </label>
            <div className="flex gap-2">
              <input
                id={passwordId}
                type={passwordVisible ? 'text' : 'password'}
                autoComplete="new-password"
                disabled={isSubmitting}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={`${passwordId}-hint`}
                className={FIELD_CLASS}
                {...register('password')}
              />
              <button
                type="button"
                aria-pressed={passwordVisible}
                onClick={() => {
                  setPasswordVisible((value) => !value)
                }}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {passwordVisible ? 'Скрыть' : 'Показать'}
              </button>
            </div>
            {errors.password ? (
              <p className="text-sm text-red-700 dark:text-red-400">
                {errors.password.message}
              </p>
            ) : (
              <p
                id={`${passwordId}-hint`}
                className="text-xs text-zinc-500 dark:text-zinc-400"
              >
                От 12 символов. Передайте его сотруднику лично.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={phoneId}
              className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Телефон <span className="text-zinc-500">— необязательно</span>
            </label>
            <input
              id={phoneId}
              type="tel"
              disabled={isSubmitting}
              aria-invalid={errors.phone ? true : undefined}
              className={FIELD_CLASS}
              {...register('phone')}
            />
            {errors.phone ? (
              <p className="text-sm text-red-700 dark:text-red-400">
                {errors.phone.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={emailId}
              className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Почта
            </label>
            <input
              id={emailId}
              type="email"
              disabled={isSubmitting}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={`${emailId}-hint`}
              className={FIELD_CLASS}
              {...register('email')}
            />
            {errors.email ? (
              <p className="text-sm text-red-700 dark:text-red-400">
                {errors.email.message}
              </p>
            ) : (
              <p
                id={`${emailId}-hint`}
                className="text-xs text-zinc-500 dark:text-zinc-400"
              >
                Рабочий адрес: на него будет приходить код входа.
              </p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isSubmitting ? 'Отправляем…' : 'Отправить запрос'}
        </button>
      </form>
    </section>
  )
}

export default CreateUserForm
