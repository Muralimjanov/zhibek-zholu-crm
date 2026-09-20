'use client'

import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { showToast } from '@/components/ui/toast-store'
import { describeApiError } from '@/features/auth/error-messages'
import { updateSessionUser } from '@/features/auth/session'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import type { User } from '@/types/auth'
import { updateProfile, type UpdateProfileInput } from '../api'
import { profileSchema, type ProfileFormValues } from '../schema'

const resolver = createZodResolver(profileSchema)

function toFormValues(user: User): ProfileFormValues {
  return {
    fullName: user.fullName,
    phone: user.phone ?? '',
  }
}

/** Пустое необязательное поле отправляем как null — это очистка значения. */
function toNullable(value: string): string | null {
  const trimmed = value.trim()

  return trimmed === '' ? null : trimmed
}

const fieldClass =
  'w-full rounded-lg border border-zinc-300 bg-surface px-3 py-2 text-sm text-zinc-900 outline-none focus-visible:border-brand-600 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50'

export function ProfileForm({ user }: { user: User }) {
  const fullNameId = useId()
  const phoneId = useId()
  const [serverError, setServerError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver,
    defaultValues: toFormValues(user),
  })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    setNotice(null)

    const payload: UpdateProfileInput = {}
    const fullName = values.fullName.trim()
    const phone = toNullable(values.phone)

    if (fullName !== user.fullName) {
      payload.fullName = fullName
    }

    if (phone !== (user.phone ?? null)) {
      payload.phone = phone
    }

    if (Object.keys(payload).length === 0) {
      setNotice('Изменений нет.')

      return
    }

    try {
      const updated = await updateProfile(payload)

      updateSessionUser(updated)
      reset(toFormValues(updated))
      setNotice('Изменения сохранены.')
      showToast('Изменения сохранены')
    } catch (error) {
      // Введённые значения намеренно не сбрасываем.
      setServerError(describeApiError(error))
    }
  })

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      {serverError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {serverError}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="rounded-lg border border-zinc-200 bg-surface-muted px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
        >
          {notice}
        </p>
      ) : null}

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
          autoComplete="name"
          disabled={isSubmitting}
          aria-invalid={errors.fullName ? true : undefined}
          aria-describedby={errors.fullName ? `${fullNameId}-error` : undefined}
          className={fieldClass}
          {...register('fullName')}
        />
        {errors.fullName ? (
          <p
            id={`${fullNameId}-error`}
            className="text-sm text-red-700 dark:text-red-400"
          >
            {errors.fullName.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor={phoneId}
          className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
        >
          Телефон
        </label>
        <input
          id={phoneId}
          type="tel"
          autoComplete="tel"
          placeholder="+996 555 12-34-56"
          disabled={isSubmitting}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={
            errors.phone ? `${phoneId}-error` : `${phoneId}-hint`
          }
          className={fieldClass}
          {...register('phone')}
        />
        {errors.phone ? (
          <p
            id={`${phoneId}-error`}
            className="text-sm text-red-700 dark:text-red-400"
          >
            {errors.phone.message}
          </p>
        ) : (
          <p
            id={`${phoneId}-hint`}
            className="text-xs text-zinc-500 dark:text-zinc-400"
          >
            Оставьте пустым, чтобы удалить телефон из профиля.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-on-brand hover:bg-brand-700 disabled:opacity-60"
        >
          {isSubmitting ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => {
            reset(toFormValues(user))
            setServerError(null)
            setNotice(null)
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200"
        >
          Отменить
        </button>
      </div>
    </form>
  )
}

export default ProfileForm
