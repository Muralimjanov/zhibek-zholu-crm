import type { Metadata } from 'next'
import LeadsScreen from '@/features/leads/components/LeadsScreen'

export const metadata: Metadata = {
  title: 'Лиды — Улуу Жибек Жолу CRM',
}

export default function LeadsPage() {
  return <LeadsScreen />
}
