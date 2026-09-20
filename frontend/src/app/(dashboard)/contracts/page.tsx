import type { Metadata } from 'next'
import ContractsScreen from '@/features/contracts/components/ContractsScreen'

export const metadata: Metadata = {
  title: 'Договоры — Улуу Жибек Жолу CRM',
}

export default function ContractsPage() {
  return <ContractsScreen />
}
