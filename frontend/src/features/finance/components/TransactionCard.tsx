'use client'

import { useSession } from '@/features/auth/useSession'
import {
  ALERT_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'
import { formatTyiynAsSom } from '@/features/contracts/money'
import { formatBishkekDateTime, formatDateOnly } from '@/features/shifts/labels'
import type { Transaction } from '@/types/finance'
import { canEditTransaction } from '../access'
import { describeFinanceError } from '../errors'
import {
  formatCategory,
  formatPeriodStatus,
  formatTransactionType,
} from '../labels'
import {
  useTransactionQuery,
  useUpdateTransaction,
  useUploadTransactionAttachment,
} from '../queries'
import EditTransactionForm from './EditTransactionForm'
import TransactionAttachment from './TransactionAttachment'

const DT = 'text-xs text-zinc-500 dark:text-zinc-400'
const DD = 'text-zinc-900 dark:text-zinc-50'

/**
 * Карточка одной операции. Всегда дочитывает `GET /transactions/{id}`
 * заново, а не переиспользует строку списка — тот же приём, что в
 * `payroll/components/PayrollEntryDetail.tsx`. Правка и загрузка вложения
 * доступны только автору записи и только до закрытия месяца
 * (`canEditTransaction` — подтверждено описанием `PATCH` в схеме API 0.3.0);
 * скачивание вложения при этом доступно директору и бухгалтеру всегда,
 * включая закрытый месяц (см. `TransactionAttachment`).
 */
export function TransactionCard({
  transactionId,
  onClose,
}: {
  transactionId: string
  onClose: () => void
}) {
  const query = useTransactionQuery(transactionId, true)

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-surface-muted p-4 dark:border-zinc-800">
      {query.isPending ? (
        <p role="status" className="text-sm text-zinc-500">
          Загружаем операцию…
        </p>
      ) : query.isError ? (
        <p role="alert" className={ALERT_CLASS}>
          {describeFinanceError(query.error)}
        </p>
      ) : (
        <TransactionCardBody
          transactionId={transactionId}
          transaction={query.data}
          isFetching={query.isFetching}
        />
      )}

      <button
        type="button"
        onClick={onClose}
        className={SECONDARY_BUTTON_CLASS}
      >
        Закрыть карточку
      </button>
    </div>
  )
}

function TransactionCardBody({
  transactionId,
  transaction,
  isFetching,
}: {
  transactionId: string
  transaction: Transaction
  isFetching: boolean
}) {
  const { user } = useSession()
  const updateMutation = useUpdateTransaction(transactionId)
  const uploadMutation = useUploadTransactionAttachment(transactionId)
  const editable = canEditTransaction(user?.role, user?.id, transaction)

  /**
   * Общий признак занятой записи: правка и загрузка вложения одной и той же
   * записи не должны идти одновременно (`CLAUDE_FINANCE_TASK.md`). В отличие
   * от зарплаты, здесь нет «неподтверждённой суммы» — правка полей и
   * загрузка файла независимы, поэтому достаточно взаимно блокировать сами
   * действия на время выполнения любого из них. `isFetching` держит блокировку
   * и во время перезапроса записи после успешной мутации.
   */
  const entryBusy =
    updateMutation.isPending || uploadMutation.isPending || isFetching

  return (
    <>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className={DT}>Тип</dt>
          <dd className={DD}>{formatTransactionType(transaction.type)}</dd>
        </div>
        <div>
          <dt className={DT}>Категория</dt>
          <dd className={DD}>{formatCategory(transaction.category)}</dd>
        </div>
        <div>
          <dt className={DT}>Дата</dt>
          <dd className={DD}>{formatDateOnly(transaction.date)}</dd>
        </div>
        <div>
          <dt className={DT}>Сумма</dt>
          <dd className={DD}>{formatTyiynAsSom(transaction.amountTyiyn)}</dd>
        </div>
        <div>
          <dt className={DT}>Подкатегория</dt>
          <dd className={DD}>{transaction.subcategory ?? '—'}</dd>
        </div>
        <div>
          <dt className={DT}>Комментарий</dt>
          <dd className={DD}>{transaction.comment ?? '—'}</dd>
        </div>
        <div>
          <dt className={DT}>Создано</dt>
          <dd className={DD}>{formatBishkekDateTime(transaction.createdAt)}</dd>
        </div>
        <div>
          <dt className={DT}>Изменено</dt>
          <dd className={DD}>{formatBishkekDateTime(transaction.updatedAt)}</dd>
        </div>
        <div>
          <dt className={DT}>Месяц</dt>
          <dd className={DD}>{formatPeriodStatus(transaction.periodClosed)}</dd>
        </div>
      </dl>

      <div className="space-y-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        {editable ? (
          <EditTransactionForm
            transaction={transaction}
            mutation={updateMutation}
            disabled={entryBusy}
          />
        ) : null}

        <TransactionAttachment
          transactionId={transaction.id}
          hasAttachment={transaction.hasAttachment}
          canUpload={editable}
          mutation={uploadMutation}
          disabled={entryBusy}
        />
      </div>
    </>
  )
}

export default TransactionCard
