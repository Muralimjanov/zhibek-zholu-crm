import type { Metadata } from 'next'
import ShiftsScreen from '@/features/shifts/components/ShiftsScreen'

export const metadata: Metadata = {
  title: 'Смены — Улуу Жибек Жолу CRM',
}

export default function ShiftsPage() {
  return <ShiftsScreen />
}
