import type { Metadata } from 'next'
import BookingDetailScreen from '@/features/bookings/components/BookingDetailScreen'

export const metadata: Metadata = {
  title: 'Бронь — Улуу Жибек Жолу CRM',
}

export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <BookingDetailScreen id={id} />
}
