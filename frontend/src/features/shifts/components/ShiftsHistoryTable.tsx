'use client'

import Badge from '@/components/ui/Badge'
import {
  TABLE_CELL_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
} from '@/components/ui/table'
import TableCard from '@/components/ui/TableCard'
import { useSession } from '@/features/auth/useSession'
import { useManagerDisplayName } from '@/features/bookings/managerDirectory'
import type { Shift } from '@/types/shift'
import {
  formatBishkekDateTime,
  formatDateOnly,
  formatShiftStatus,
  shiftStatusTone,
} from '../labels'

/**
 * `useManagerDisplayName` переиспользован из бронирований: логика
 * «директор/начальник продаж резолвят по GET /users, остальные — только
 * себя» одинакова для брони, договора и теперь смены.
 */
export function ShiftsHistoryTable({
  items,
  showEmployee,
}: {
  items: Shift[]
  showEmployee: boolean
}) {
  const { user } = useSession()
  const employeeName = useManagerDisplayName(user?.role, user?.id)

  return (
    <TableCard>
      <table className="w-full min-w-[40rem] border-collapse">
        <caption className="sr-only">История смен</caption>
        <thead>
          <tr className={TABLE_HEAD_ROW_CLASS}>
            {showEmployee ? (
              <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
                Сотрудник
              </th>
            ) : null}
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Дата
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Статус
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Открыта
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Закрыта
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((shift) => (
            <tr key={shift.id} className={TABLE_ROW_CLASS}>
              {showEmployee ? (
                <td className={TABLE_CELL_CLASS}>
                  {employeeName(shift.userId)}
                </td>
              ) : null}
              <td className={TABLE_CELL_CLASS}>{formatDateOnly(shift.date)}</td>
              <td className={TABLE_CELL_CLASS}>
                <Badge tone={shiftStatusTone(shift.status)}>
                  {formatShiftStatus(shift.status)}
                </Badge>
              </td>
              <td className={TABLE_CELL_CLASS}>
                {formatBishkekDateTime(shift.openedAt)}
              </td>
              <td className={TABLE_CELL_CLASS}>
                {formatBishkekDateTime(shift.closedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

export default ShiftsHistoryTable
