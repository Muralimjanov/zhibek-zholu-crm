import type { Metadata } from 'next'
import ContractDetailScreen from '@/features/contracts/components/ContractDetailScreen'

export const metadata: Metadata = {
  title: 'Договор — Улуу Жибек Жолу CRM',
}

export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <ContractDetailScreen id={id} />
}
