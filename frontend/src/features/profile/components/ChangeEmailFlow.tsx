'use client'

import { useId, useState } from 'react'
import { showToast } from '@/components/ui/toast-store'
import { useEmailCodeConfirm } from '@/features/auth/useEmailCodeConfirm'
import { updateSessionUser } from '@/features/auth/session'
import { describeConfirmationError } from '@/features/auth/error-messages'
import { readEmailCodeChallenge } from '@/features/auth/emailCodes'
import type { User } from '@/types/auth'
import { confirmEmailChange, startEmailChange } from '../api'
import { emailCodeSchema, newEmailSchema } from '../schema'

const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-surface px-3 py-2 text-sm text-zinc-900 outline-none focus-visible:border-brand-600 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50'
const labelClass = 'block text-sm font-medium text-zinc-900 dark:text-zinc-100'
const errorClass = 'text-sm text-red-700 dark:text-red-400'
const alertClass =
  'rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
const primaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-on-brand hover:bg-brand-700 disabled:opacity-60'

type Step = 'idle' | 'new-email' | 'new-code' | 'done'

/**
 * Смена почты (API 0.2.0) — два РАЗНЫХ кода на два РАЗНЫХ адреса:
 * 1. Код на текущий адрес (`user.email.change`) подтверждает, что запрос
 *    исходит от владельца текущего ящика.
 * 2. `POST /users/me/email` с этим кодом в заголовках и новым адресом в
 *    теле — сервер шлёт ВТОРОЙ код уже на новый адрес.
 * 3. `POST /users/me/email/confirm` с кодом из нового письма — только
 *    здесь почта реально меняется.
 * Ни один код и ни один challengeId никогда не попадают в
 * localStorage/sessionStorage/URL — только в состояние этого компонента.
 */
export function ChangeEmailFlow({ user }: { user: User }) {
  const newEmailId = useId()
  const currentCodeId = useId()
  const newCodeId = useId()

  const [step, setStep] = useState<Step>('idle')
  const [newEmail, setNewEmail] = useState('')
  const [currentCode, setCurrentCode] = useState('')
  const [newCode, setNewCode] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [newChallengeId, setNewChallengeId] = useState<string | null>(null)

  const currentChallenge = useEmailCodeConfirm('user.email.change')

  if (!user.email) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Смена почты недоступна: в профиле нет текущего адреса, на который можно
        отправить код подтверждения. Обратитесь к руководителю, чтобы адрес
        добавили.
      </p>
    )
  }

  const reset = () => {
    setStep('idle')
    setNewEmail('')
    setCurrentCode('')
    setNewCode('')
    setFieldError(null)
    setServerError(null)
    setNewChallengeId(null)
    currentChallenge.reset()
  }

  const start = () => {
    setServerError(null)
    setStep('new-email')
    void currentChallenge.requestCode()
  }

  const submitNewEmail = async () => {
    setFieldError(null)
    setServerError(null)

    const parsedEmail = newEmailSchema.safeParse(newEmail)

    if (!parsedEmail.success) {
      setFieldError(
        parsedEmail.error.issues[0]?.message ?? 'Проверьте адрес почты',
      )

      return
    }

    const parsedCode = emailCodeSchema.safeParse(currentCode)

    if (!parsedCode.success) {
      setFieldError('Введите код из письма на текущую почту')

      return
    }

    setPending(true)

    try {
      const payload = await startEmailChange(
        parsedEmail.data,
        currentChallenge.headersFor(parsedCode.data),
      )
      const challenge = readEmailCodeChallenge(payload)

      if (!challenge) {
        setServerError(
          'Сервер не вернул номер следующего запроса кода. Попробуйте ещё раз.',
        )

        return
      }

      setNewChallengeId(challenge.challengeId)
      setStep('new-code')
    } catch (error) {
      setServerError(describeConfirmationError(error))
    } finally {
      setPending(false)
    }
  }

  const submitNewCode = async () => {
    if (!newChallengeId) {
      return
    }

    setFieldError(null)
    setServerError(null)

    const parsedCode = emailCodeSchema.safeParse(newCode)

    if (!parsedCode.success) {
      setFieldError('Введите код из письма на новую почту')

      return
    }

    setPending(true)

    try {
      const updated = await confirmEmailChange(newChallengeId, parsedCode.data)

      updateSessionUser(updated)
      setStep('done')
      showToast('Почта изменена')
    } catch (error) {
      setServerError(describeConfirmationError(error))
    } finally {
      setPending(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="space-y-2">
        <p className="rounded-lg border border-zinc-200 bg-surface-muted px-3 py-2 text-sm text-zinc-800 dark:border-zinc-800 dark:text-zinc-200">
          Почта изменена.
        </p>
        <button type="button" onClick={reset} className={buttonClass}>
          Закрыть
        </button>
      </div>
    )
  }

  if (step === 'idle') {
    return (
      <button type="button" onClick={start} className={buttonClass}>
        Изменить почту
      </button>
    )
  }

  if (step === 'new-email') {
    return (
      <div className="space-y-4">
        {currentChallenge.phase === 'requesting' ? (
          <p role="status" className="text-sm text-zinc-500">
            Отправляем код на {user.email}…
          </p>
        ) : currentChallenge.phase === 'awaiting-code' ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Код отправлен на текущую почту {user.email}. Введите его вместе с
            новым адресом.
          </p>
        ) : null}

        {currentChallenge.error ? (
          <p role="alert" className={alertClass}>
            {currentChallenge.error}
          </p>
        ) : null}

        {serverError ? (
          <p role="alert" className={alertClass}>
            {serverError}
          </p>
        ) : null}

        {fieldError ? <p className={errorClass}>{fieldError}</p> : null}

        <div className="space-y-1.5">
          <label htmlFor={newEmailId} className={labelClass}>
            Новая почта
          </label>
          <input
            id={newEmailId}
            type="email"
            disabled={pending}
            value={newEmail}
            onChange={(event) => {
              setNewEmail(event.target.value)
            }}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={currentCodeId} className={labelClass}>
            Код с текущей почты
          </label>
          <input
            id={currentCodeId}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            disabled={pending || currentChallenge.phase !== 'awaiting-code'}
            value={currentCode}
            onChange={(event) => {
              setCurrentCode(event.target.value)
            }}
            className={inputClass}
          />
        </div>

        <div className="flex flex-wrap gap-2.5">
          {currentChallenge.phase === 'idle' && currentChallenge.error ? (
            <button
              type="button"
              onClick={() => void currentChallenge.requestCode()}
              className={buttonClass}
            >
              Запросить код ещё раз
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || currentChallenge.phase !== 'awaiting-code'}
              onClick={() => void submitNewEmail()}
              className={primaryButtonClass}
            >
              {pending ? 'Отправляем…' : 'Продолжить'}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={reset}
            className={buttonClass}
          >
            Отмена
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Код отправлен на {newEmail}. Введите его, чтобы подтвердить новый адрес.
      </p>

      {serverError ? (
        <p role="alert" className={alertClass}>
          {serverError}
        </p>
      ) : null}

      {fieldError ? <p className={errorClass}>{fieldError}</p> : null}

      <div className="space-y-1.5">
        <label htmlFor={newCodeId} className={labelClass}>
          Код с новой почты
        </label>
        <input
          id={newCodeId}
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          disabled={pending}
          value={newCode}
          onChange={(event) => {
            setNewCode(event.target.value)
          }}
          className={inputClass}
        />
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => void submitNewCode()}
          className={primaryButtonClass}
        >
          {pending ? 'Подтверждаем…' : 'Подтвердить новую почту'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={reset}
          className={buttonClass}
        >
          Отмена
        </button>
      </div>
    </div>
  )
}

export default ChangeEmailFlow
