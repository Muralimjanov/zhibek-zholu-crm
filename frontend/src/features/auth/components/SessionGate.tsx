'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import PageLoader from '@/components/ui/PageLoader'
import { checkConsents } from '../session'
import { useSession } from '../useSession'

interface SessionGateProps {
  children: ReactNode
  /** Нужно ли требовать принятые обязательные согласия. */
  requireConsent?: boolean
}

/** Локальные, не общий `bookings/components/section` — этот экран стоит до входа в dashboard shell. */
const ALERT_CLASS =
  'rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger dark:border-red-900 dark:bg-red-950'
const SECONDARY_BUTTON_CLASS =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'

/**
 * Показывает содержимое только после успешной проверки сессии.
 * Пока проверка идёт, виден нейтральный экран загрузки, поэтому защищённая
 * страница не мелькает перед редиректом.
 */
export function SessionGate({
  children,
  requireConsent = true,
}: SessionGateProps) {
  const { status, consent, consentError } = useSession()
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')

      return
    }

    if (
      status === 'authenticated' &&
      requireConsent &&
      consent === 'required'
    ) {
      router.replace('/consents')
    }
  }, [status, consent, requireConsent, router])

  if (status !== 'authenticated') {
    return <PageLoader label="Проверяем сессию…" />
  }

  if (!requireConsent) {
    return <>{children}</>
  }

  if (consent === 'granted') {
    return <>{children}</>
  }

  if (consent === 'unknown' && consentError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface-muted px-4 py-12">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Не удалось проверить согласия
          </h1>
          <p role="alert" className={ALERT_CLASS}>
            {consentError}
          </p>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            disabled={retrying}
            onClick={() => {
              setRetrying(true)
              void checkConsents().finally(() => {
                setRetrying(false)
              })
            }}
          >
            {retrying ? 'Проверяем…' : 'Повторить проверку'}
          </button>
        </div>
      </main>
    )
  }

  return <PageLoader label="Проверяем согласия…" />
}

export default SessionGate
