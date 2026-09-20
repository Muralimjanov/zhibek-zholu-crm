import type { Metadata } from 'next'
import DashboardScreen from '@/features/reports/components/DashboardScreen'

export const metadata: Metadata = {
  title: 'Главная — Улуу Жибек Жолу CRM',
}

export default function DashboardPage() {
  return <DashboardScreen />
}
