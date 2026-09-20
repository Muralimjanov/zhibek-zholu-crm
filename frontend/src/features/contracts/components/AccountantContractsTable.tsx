'use client'

import Badge from '@/components/ui/Badge'
import {
  TABLE_CELL_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
} from '@/components/ui/table'
import TableCard from '@/components/ui/TableCard'
import { formatArea } from '@/features/bookings/area'
import type { Contract } from '@/types/contract'
import { contractStatusTone, formatContractStatus, formatDate } from '../labels'
import { formatPercent, formatTyiynAsSom } from '../money'
import DepositConfirm from './DepositConfirm'

/**
 * Бухгалтерское представление: только суммы и статусы, без ФИО, паспорта и
 * адреса покупателя (подтверждено описанием `GET /contracts` в OpenAPI:
 * «Accountant receives a finance-only view without buyer PII»). Колонки
 * с персональными данными здесь намеренно отсутствуют, а не скрыты стилем —
 * при переносе на новые примитивы состав колонок не менялся.
 *
 * Подтверждение взноса — прямо в строке, без перехода в карточку: `GET
 * /contracts/{id}` для бухгалтера не проверен на staging (см. `access.ts`,
 * `canViewContractDetail`), поэтому его представление опирается только на
 * уже загруженный список.
 */
export function AccountantContractsTable({ items }: { items: Contract[] }) {
  return (
    <TableCard>
      <table className="w-full min-w-[50rem] border-collapse">
        <caption className="sr-only">
          Договоры — финансовое представление
        </caption>
        <thead>
          <tr className={TABLE_HEAD_ROW_CLASS}>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Статус
            </th>
            <th scope="col" className={`${TABLE_HEAD_CELL_CLASS} text-right`}>
              Площадь
            </th>
            <th scope="col" className={`${TABLE_HEAD_CELL_CLASS} text-right`}>
              Сумма
            </th>
            <th scope="col" className={`${TABLE_HEAD_CELL_CLASS} text-right`}>
              Процент взноса
            </th>
            <th scope="col" className={`${TABLE_HEAD_CELL_CLASS} text-right`}>
              Взнос
            </th>
            <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
              Файл
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
              <td className={TABLE_CELL_CLASS}>
                <Badge tone={contractStatusTone(contract.status)}>
                  {formatContractStatus(contract.status)}
                </Badge>
              </td>
              <td className={`${TABLE_CELL_CLASS} text-right`}>
                {formatArea(contract.areaSqm)}
              </td>
              <td className={`${TABLE_CELL_CLASS} text-right`}>
                {formatTyiynAsSom(contract.totalAmountTyiyn)}
              </td>
              <td className={`${TABLE_CELL_CLASS} text-right`}>
                {formatPercent(contract.depositPercent)}
              </td>
              <td className={`${TABLE_CELL_CLASS} text-right`}>
                {formatTyiynAsSom(contract.depositAmountTyiyn)}
                {contract.depositPaid ? ' · оплачен' : ' · не оплачен'}
              </td>
              <td className={TABLE_CELL_CLASS}>
                {contract.hasFile ? 'есть' : 'нет'}
              </td>
              <td className={TABLE_CELL_CLASS}>
                {formatDate(contract.createdAt)}
              </td>
              <td className={TABLE_CELL_CLASS}>
                {contract.depositPaid ? null : (
                  <DepositConfirm
                    contractId={contract.id}
                    depositAmountTyiyn={contract.depositAmountTyiyn}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

export default AccountantContractsTable
