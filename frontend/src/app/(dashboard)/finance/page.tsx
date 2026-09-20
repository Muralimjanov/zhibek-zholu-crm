import type { Metadata } from 'next'
import FinanceScreen from '@/features/finance/components/FinanceScreen'

export const metadata: Metadata = {
  title: 'Бухгалтерия — Улуу Жибек Жолу CRM',
}

export default function FinancePage() {
  return <FinanceScreen />
}
