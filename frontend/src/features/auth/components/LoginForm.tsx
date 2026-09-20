'use client'

import { EyeIcon, EyeSlashIcon, InfoIcon } from '@phosphor-icons/react/dist/ssr'
import type { ReactNode } from 'react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { createZodResolver } from '@/lib/forms/zod-resolver'
import { APP_NAME } from '@/lib/constants'
import type { LoginChallenge } from '@/types/auth'
import { describeLoginError, describeLoginVerifyError } from '../error-messages'
import { startLogin, verifyLogin } from '../session'
import { PolicyFooter } from './PolicyFooter'

const credentialsSchema = z.object({
  username: z.string().trim().min(1, 'Введите логин'),
  password: z.string().min(1, 'Введите пароль'),
})

type CredentialsFormValues = z.infer<typeof credentialsSchema>
const credentialsResolver = createZodResolver(credentialsSchema)

const codeSchema = z.object({
  code: z.string().trim().min(1, 'Введите код из письма'),
})

type CodeFormValues = z.infer<typeof codeSchema>
const codeResolver = createZodResolver(codeSchema)

const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-surface px-3 py-2 text-sm text-zinc-900 shadow-xs outline-none transition-colors focus-visible:border-brand-600 dark:border-zinc-700 dark:text-zinc-50'
const labelClass = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300'
const errorClass = 'text-sm text-red-700 dark:text-red-400'
const alertClass =
  'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
const primaryButtonClass =
  'flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60'

function BrandMark() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-on-brand shadow-sm"
      >
        {APP_NAME.charAt(0)}
      </span>
    </div>
  )
}

/**
 * Desktop: спокойная двухколоночная композиция 40/60 (дизайн-контракт, п.10)
 * — слева фирменная панель с тегом, справа форма. На mobile панель скрыта,
 * остаётся только компактный `BrandMark` внутри карточки.
 */
function LoginLayout({
  step,
  footer,
  children,
}: {
  step: 1 | 2
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[2fr_3fr]">
      <div className="hidden bg-brand-900 lg:flex lg:flex-col lg:justify-center lg:px-16 lg:py-12">
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-on-brand shadow-sm"
        >
          {APP_NAME.charAt(0)}
        </span>
        <h2 className="mt-6 max-w-sm text-2xl font-semibold tracking-tight text-white">
          {APP_NAME}
        </h2>
        <p className="mt-3 max-w-sm text-sm text-white/70">
          Продажи, договоры и финансы в одном рабочем пространстве.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-surface-muted px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-zinc-200 bg-surface p-6 shadow-md dark:border-zinc-800">
            <div className="lg:hidden">
              <BrandMark />
            </div>

            <p className="mt-4 text-center text-caption font-semibold uppercase tracking-wide text-muted lg:mt-0 lg:text-left">
              Шаг {step} из 2
            </p>

            {children}
          </div>

          {footer}
        </div>
      </div>
    </main>
  )
}

/**
 * Двухшаговый вход (API 0.2.0): логин и пароль → код из письма. Пароль
 * живёт только в состоянии формы шага 1 и полностью пропадает при переходе
 * к шагу 2 — форма шага 1 размонтируется, а не просто скрывается. Challenge
 * и введённый код держим только в памяти компонента, никогда не в
 * sessionStorage/localStorage/URL.
 */
export function LoginForm() {
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null)

  return challenge ? (
    <CodeStep
      challenge={challenge}
      onBack={() => {
        setChallenge(null)
      }}
    />
  ) : (
    <CredentialsStep onChallenge={setChallenge} />
  )
}

function CredentialsStep({
  onChallenge,
}: {
  onChallenge: (challenge: LoginChallenge) => void
}) {
  const usernameId = useId()
  const passwordId = useId()
  const [formError, setFormError] = useState<string | null>(null)
  const [passwordVisible, setPasswordVisible] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CredentialsFormValues>({
    resolver: credentialsResolver,
    defaultValues: { username: '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)

    try {
      const challenge = await startLogin(values)

      onChallenge(challenge)
    } catch (error) {
      setFormError(describeLoginError(error))
    }
  })

  return (
    <LoginLayout step={1} footer={<PolicyFooter />}>
      <h1 className="mt-2 text-center text-xl font-semibold tracking-tight text-zinc-900 lg:text-left dark:text-zinc-50">
        Вход в CRM «Улуу Жибек Жолу»
      </h1>
      <p className="mt-2 text-center text-sm text-zinc-600 lg:text-left dark:text-zinc-400">
        Учётные данные выдаёт руководитель. Самостоятельная регистрация не
        предусмотрена.
      </p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
        {formError ? (
          <p role="alert" className={alertClass}>
            {formError}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor={usernameId} className={labelClass}>
            Логин
          </label>
          <input
            id={usernameId}
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={errors.username ? true : undefined}
            aria-describedby={
              errors.username ? `${usernameId}-error` : undefined
            }
            className={inputClass}
            {...register('username')}
          />
          {errors.username ? (
            <p id={`${usernameId}-error`} className={errorClass}>
              {errors.username.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={passwordId} className={labelClass}>
            Пароль
          </label>
          <div className="flex gap-2">
            <input
              id={passwordId}
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={
                errors.password ? `${passwordId}-error` : undefined
              }
              className={inputClass}
              {...register('password')}
            />
            <button
              type="button"
              aria-pressed={passwordVisible}
              aria-label={passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}
              onClick={() => {
                setPasswordVisible((visible) => !visible)
              }}
              className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {passwordVisible ? (
                <EyeSlashIcon size={18} aria-hidden="true" />
              ) : (
                <EyeIcon size={18} aria-hidden="true" />
              )}
            </button>
          </div>
          {errors.password ? (
            <p id={`${passwordId}-error`} className={errorClass}>
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={primaryButtonClass}
        >
          {isSubmitting ? 'Входим…' : 'Войти'}
        </button>

        <p className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-info dark:bg-blue-950">
          <InfoIcon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          Тестовый сервер засыпает без запросов, поэтому первый вход может
          занять до минуты.
        </p>
      </form>
    </LoginLayout>
  )
}

function CodeStep({
  challenge,
  onBack,
}: {
  challenge: LoginChallenge
  onBack: () => void
}) {
  const codeId = useId()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CodeFormValues>({
    resolver: codeResolver,
    defaultValues: { code: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)

    try {
      await verifyLogin({
        challengeId: challenge.challengeId,
        code: values.code,
      })
    } catch (error) {
      setFormError(describeLoginVerifyError(error))
    }
  })

  return (
    <LoginLayout step={2}>
      <h1 className="mt-2 text-center text-xl font-semibold tracking-tight text-zinc-900 lg:text-left dark:text-zinc-50">
        Код из письма
      </h1>
      <p className="mt-2 text-center text-sm text-zinc-600 lg:text-left dark:text-zinc-400">
        {challenge.emailHint
          ? `Мы отправили код на ${challenge.emailHint}.`
          : 'Мы отправили код на вашу почту.'}
      </p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
        {formError ? (
          <p role="alert" className={alertClass}>
            {formError}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor={codeId} className={labelClass}>
            Код
          </label>
          <input
            id={codeId}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            aria-invalid={errors.code ? true : undefined}
            aria-describedby={errors.code ? `${codeId}-error` : undefined}
            className={inputClass}
            {...register('code')}
          />
          {errors.code ? (
            <p id={`${codeId}-error`} className={errorClass}>
              {errors.code.message}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={primaryButtonClass}
        >
          {isSubmitting ? 'Проверяем…' : 'Подтвердить'}
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={onBack}
          className="w-full cursor-pointer text-sm font-medium text-brand-700 underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60 dark:text-brand-300"
        >
          Ввести логин и пароль заново
        </button>
      </form>
    </LoginLayout>
  )
}

export default LoginForm
