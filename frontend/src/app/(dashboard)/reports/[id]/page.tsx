import type { Metadata } from 'next'
import ReportDetailScreen from '@/features/reports/components/ReportDetailScreen'
export const metadata: Metadata = {
  title: 'Ежедневный отчёт — Улуу Жибек Жолу CRM',
}
export default async function ReportPage({
  params,
}: PageProps<'/reports/[id]'>) {
  const { id } = await params
  return <ReportDetailScreen id={id} />
}
