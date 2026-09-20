import type { Metadata } from 'next'
import BookingsScreen from '@/features/bookings/components/BookingsScreen'

export const metadata: Metadata = {
  title: 'Бронирования — Улуу Жибек Жолу CRM',
}

export default function BookingsPage() {
  return <BookingsScreen />
}
