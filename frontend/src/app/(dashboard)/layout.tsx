import type { ReactNode } from 'react'
import AppShell from '@/components/layout/AppShell'
import SessionGate from '@/features/auth/components/SessionGate'

export default function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <SessionGate>
      <AppShell>{children}</AppShell>
    </SessionGate>
  )
}
