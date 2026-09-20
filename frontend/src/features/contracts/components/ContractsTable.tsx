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
import { formatArea } from '@/features/bookings/area'
import { useManagerDisplayName } from '@/features/bookings/managerDirectory'
import type { Contract } from '@/types/contract'
import { contractStatusTone, formatContractStatus, formatDate } from '../labels'
import { formatTyiynAsSom } from '../money'

export function ContractsTable({ items }: { items: Contract[] }) {
  const { user } = useSession()
  const managerName = useManagerDisplayName(user?.role, user?.id)

  return (
    <TableCard>
      <table className="w-full min-w-[58rem] border-collapse">
        <caption className="sr-only">Список договоров</caption>
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
            <th scope="col" className={`${TABLE_HEAD_CELL_CLASS} text-right`}>
              Сумма
            </th>
            <th scope="col" className={`${TABLE_HEAD_CELL_CLASS} text-right`}>
              Взнос
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Менеджер
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Создан
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              <span className="sr-only">Действия</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((contract) => (
            <tr key={contract.id} className={TABLE_ROW_CLASS}>
              <td className={TABLE_CELL_STRONG_CLASS}>
                {contract.fullName ?? '—'}
              </td>
              <td className={TABLE_CELL_CLASS}>
                <Badge tone={contractStatusTone(contract.status)}>
                  {formatContractStatus(contract.status)}
                </Badge>
              </td>
              <td className={`${TABLE_CELL_CLASS} text-right`}>
                {formatArea(contract.areaSqm)}
              </td>
              {/* Сервер отдаёт в списке маску вида *******0000; полный номер только в карточке. */}
              <td className={`${TABLE_CELL_CLASS} font-mono`}>
                {contract.passportNumber ?? '—'}
              </td>
              <td className={`${TABLE_CELL_CLASS} text-right`}>
                {formatTyiynAsSom(contract.totalAmountTyiyn)}
              </td>
              <td className={`${TABLE_CELL_CLASS} text-right`}>
                {formatTyiynAsSom(contract.depositAmountTyiyn)}
                {contract.depositPaid ? ' · оплачен' : ''}
              </td>
              <td className={TABLE_CELL_CLASS}>
                {managerName(contract.managerId)}
              </td>
              <td className={TABLE_CELL_CLASS}>
                {formatDate(contract.createdAt)}
              </td>
              <td className={TABLE_CELL_CLASS}>
                <Link
                  href={`/contracts/${contract.id}`}
                  className="font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
                >
                  Открыть
                  <span className="sr-only">
                    {' '}
                    {contract.fullName
                      ? `договор ${contract.fullName}`
                      : 'договор'}
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

export default ContractsTable
