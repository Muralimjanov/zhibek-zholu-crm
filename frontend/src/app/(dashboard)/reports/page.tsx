import type { Metadata } from 'next'
import ReportsScreen from '@/features/reports/components/ReportsScreen'
export const metadata: Metadata = { title: 'Отчёты — Улуу Жибек Жолу CRM' }
export default function ReportsPage() {
  return <ReportsScreen />
}
