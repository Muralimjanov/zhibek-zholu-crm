import type { Metadata } from 'next'
import SessionGate from '@/features/auth/components/SessionGate'
import ConsentsForm from '@/features/legal/components/ConsentsForm'

export const metadata: Metadata = {
  title: 'Документы — Улуу Жибек Жолу CRM',
}

export default function ConsentsPage() {
  return (
    <SessionGate requireConsent={false}>
      <ConsentsForm />
    </SessionGate>
  )
}
