import type { Metadata } from 'next'
import GuestGate from '@/features/auth/components/GuestGate'
import LoginForm from '@/features/auth/components/LoginForm'

export const metadata: Metadata = {
  title: 'Вход — Улуу Жибек Жолу CRM',
}

export default function LoginPage() {
  return (
    <GuestGate>
      <LoginForm />
    </GuestGate>
  )
}
