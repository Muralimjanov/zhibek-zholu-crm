'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import PageLoader from '@/components/ui/PageLoader'
import { useSession } from '@/features/auth/useSession'

export default function HomePage() {
  const { status, consent } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')

      return
    }

    if (status === 'authenticated') {
      router.replace(consent === 'required' ? '/consents' : '/dashboard')
    }
  }, [status, consent, router])

  return <PageLoader label="Проверяем сессию…" />
}
