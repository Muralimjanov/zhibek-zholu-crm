'use client'

import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import PageLoader from '@/components/ui/PageLoader'
import { useSession } from '../useSession'

/**
 * Страницы для неавторизованного пользователя. Если сессия уже восстановлена,
 * пользователь уходит в CRM или на страницу согласий.
 */
export function GuestGate({ children }: { children: ReactNode }) {
  const { status, consent } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status !== 'authenticated') {
      return
    }

    router.replace(consent === 'required' ? '/consents' : '/dashboard')
  }, [status, consent, router])

  if (status === 'idle' || status === 'loading') {
    return <PageLoader label="Проверяем сессию…" />
  }

  if (status === 'authenticated') {
    return <PageLoader label="Открываем CRM…" />
  }

  return <>{children}</>
}

export default GuestGate
