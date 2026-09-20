'use client'

import Badge from '@/components/ui/Badge'
import {
  TABLE_CELL_CLASS,
  TABLE_CELL_STRONG_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
} from '@/components/ui/table'
import TableCard from '@/components/ui/TableCard'
import { formatTyiynAsSom } from '@/features/contracts/money'
import type { PayrollEntry } from '@/types/payroll'
import {
  formatEmployeeName,
  formatPayrollEntryStatus,
  formatPeriod,
  payrollEntryStatusTone,
} from '../labels'

/** Сырой `id`/`userId` наружу не показываем — только то, что уже подписано сервером. */
export function PayrollEntriesTable({
  items,
  selectedId,
  onSelect,
}: {
  items: PayrollEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <TableCard>
      <table className="w-full min-w-[36rem] border-collapse">
        <caption className="sr-only">Начисления зарплаты</caption>
        <thead>
          <tr className={TABLE_HEAD_ROW_CLASS}>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Сотрудник
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Период
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Статус
            </th>
            <th scope="col" className={`${TABLE_HEAD_CELL_CLASS} text-right`}>
              К выплате
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              <span className="sr-only">Действия</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.id} className={TABLE_ROW_CLASS}>
              <td className={TABLE_CELL_STRONG_CLASS}>
                {formatEmployeeName(entry.employeeFullName)}
              </td>
              <td className={TABLE_CELL_CLASS}>{formatPeriod(entry.period)}</td>
              <td className={TABLE_CELL_CLASS}>
                <Badge tone={payrollEntryStatusTone(entry.status)}>
                  {formatPayrollEntryStatus(entry.status)}
                </Badge>
              </td>
              <td className={`${TABLE_CELL_CLASS} text-right`}>
                {formatTyiynAsSom(entry.finalAmountTyiyn)}
              </td>
              <td className={TABLE_CELL_CLASS}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(entry.id)
                  }}
                  className="cursor-pointer text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
                >
                  {selectedId === entry.id ? 'Открыта' : 'Открыть'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

export default PayrollEntriesTable
