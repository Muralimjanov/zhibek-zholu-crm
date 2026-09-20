'use client'

import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import {
  TABLE_CELL_CLASS,
  TABLE_CELL_STRONG_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
} from '@/components/ui/table'
import TableCard from '@/components/ui/TableCard'
import { useSession } from '@/features/auth/useSession'
import type { Booking } from '@/types/booking'
import { formatArea } from '../area'
import { bookingStatusTone, formatBookingStatus, formatDate } from '../labels'
import { useManagerDisplayName } from '../managerDirectory'

export function BookingsTable({ items }: { items: Booking[] }) {
  const { user } = useSession()
  const managerName = useManagerDisplayName(user?.role, user?.id)

  return (
    <TableCard>
      <table className="w-full min-w-[52rem] border-collapse">
        <caption className="sr-only">Список бронирований</caption>
        <thead>
          <tr className={TABLE_HEAD_ROW_CLASS}>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              ФИО покупателя
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Статус
            </th>
            <th scope="col" className={`${TABLE_HEAD_CELL_CLASS} text-right`}>
              Площадь
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Паспорт
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Телефон
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Менеджер
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Создана
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              <span className="sr-only">Действия</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((booking) => (
            <tr key={booking.id} className={TABLE_ROW_CLASS}>
              <td className={TABLE_CELL_STRONG_CLASS}>
                {booking.fullName ?? '—'}
              </td>
              <td className={TABLE_CELL_CLASS}>
                <Badge tone={bookingStatusTone(booking.status)}>
                  {formatBookingStatus(booking.status)}
                </Badge>
              </td>
              <td className={`${TABLE_CELL_CLASS} text-right`}>
                {formatArea(booking.desiredAreaSqm)}
              </td>
              {/* Сервер отдаёт в списке маску вида *****4567; полный номер только в карточке. */}
              <td className={`${TABLE_CELL_CLASS} font-mono`}>
                {booking.passportNumber ?? '—'}
              </td>
              <td className={TABLE_CELL_CLASS}>{booking.phone ?? '—'}</td>
              <td className={TABLE_CELL_CLASS}>
                {managerName(booking.managerId)}
              </td>
              <td className={TABLE_CELL_CLASS}>
                {formatDate(booking.createdAt)}
              </td>
              <td className={TABLE_CELL_CLASS}>
                <Link
                  href={`/bookings/${booking.id}`}
                  className="font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
                >
                  Открыть
                  <span className="sr-only">
                    {' '}
                    {booking.fullName ? `бронь ${booking.fullName}` : 'бронь'}
                  </span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

export default BookingsTable
