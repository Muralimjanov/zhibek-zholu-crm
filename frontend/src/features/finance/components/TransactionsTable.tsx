'use client'

import Badge from '@/components/ui/Badge'
import {
  TABLE_CELL_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
} from '@/components/ui/table'
import TableCard from '@/components/ui/TableCard'
import { formatDateOnly } from '@/features/shifts/labels'
import { formatTyiynAsSom } from '@/features/contracts/money'
import type { Transaction } from '@/types/finance'
import {
  formatCategory,
  formatTransactionType,
  transactionTypeTone,
} from '../labels'

/**
 * `date` — уже `YYYY-MM-DD`, календарный день Бишкека — тот же приём, что в
 * `ShiftsHistoryTable`. Столбец «Файл»: `—` — сервер не прислал
 * `hasAttachment` (неизвестно), отдельно от «Нет» (подтверждённое
 * отсутствие) — их нельзя показывать одинаково.
 */
export function TransactionsTable({
  items,
  selectedId,
  onSelect,
}: {
  items: Transaction[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <TableCard>
      <table className="w-full min-w-[36rem] border-collapse">
        <caption className="sr-only">Операции бухгалтерии</caption>
        <thead>
          <tr className={TABLE_HEAD_ROW_CLASS}>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Дата
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Тип
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Категория
            </th>
            <th scope="col" className={`${TABLE_HEAD_CELL_CLASS} text-right`}>
              Сумма
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Файл
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              <span className="sr-only">Действия</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((transaction) => (
            <tr key={transaction.id} className={TABLE_ROW_CLASS}>
              <td className={TABLE_CELL_CLASS}>
                {formatDateOnly(transaction.date)}
              </td>
              <td className={TABLE_CELL_CLASS}>
                <Badge tone={transactionTypeTone(transaction.type)}>
                  {formatTransactionType(transaction.type)}
                </Badge>
              </td>
              <td className={TABLE_CELL_CLASS}>
                {formatCategory(transaction.category)}
              </td>
              <td className={`${TABLE_CELL_CLASS} text-right`}>
                {formatTyiynAsSom(transaction.amountTyiyn)}
              </td>
              <td className={TABLE_CELL_CLASS}>
                {transaction.hasAttachment === null
                  ? '—'
                  : transaction.hasAttachment
                    ? 'Есть'
                    : 'Нет'}
              </td>
              <td className={TABLE_CELL_CLASS}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(transaction.id)
                  }}
                  className="cursor-pointer text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
                >
                  {selectedId === transaction.id ? 'Открыта' : 'Открыть'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

export default TransactionsTable
