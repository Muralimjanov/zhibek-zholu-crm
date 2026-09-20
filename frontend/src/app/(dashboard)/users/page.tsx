import type { Metadata } from 'next'
import UsersScreen from '@/features/users/components/UsersScreen'

export const metadata: Metadata = {
  title: 'Пользователи — Улуу Жибек Жолу CRM',
}

export default function UsersPage() {
  return <UsersScreen />
}
