import type { Metadata } from 'next'
import ProfileScreen from '@/features/profile/components/ProfileScreen'

export const metadata: Metadata = {
  title: 'Профиль — Улуу Жибек Жолу CRM',
}

export default function ProfilePage() {
  return <ProfileScreen />
}
