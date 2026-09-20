import type { Metadata } from 'next'
import PayrollScreen from '@/features/payroll/components/PayrollScreen'

export const metadata: Metadata = {
  title: 'Зарплата — Улуу Жибек Жолу CRM',
}

export default function PayrollPage() {
  return <PayrollScreen />
}
