import type { Metadata } from 'next'
import ReceptionScreen from '@/features/leads/components/ReceptionScreen'

export const metadata: Metadata = {
  title: 'Приём обращений — Улуу Жибек Жолу CRM',
}

/**
 * Отдельная ссылка для ресепшена: только форма и список записанного за
 * сегодня. Сотруднику за стойкой не нужно искать нужный раздел в меню —
 * страницу можно держать открытой всю смену.
 */
export default function ReceptionPage() {
  return <ReceptionScreen />
}
