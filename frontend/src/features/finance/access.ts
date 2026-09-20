import type { UserRole } from '@/types/auth'
import type { Transaction } from '@/types/finance'

type Role = UserRole | null | undefined

/**
 * Живьём подтверждено (`FINANCE_API_EXAMPLES.md`): `GET /transactions` и
 * `GET /accounting/summary` отвечают 200 и директору, и бухгалтеру.
 */
export function canViewFinanceSection(role: Role): boolean {
  return role === 'director' || role === 'accountant'
}

/**
 * Единственная подтверждённая живьём пишущая роль (создание, коррекция,
 * вложение). Директору по таблице ролей `FRONTEND_ARCHITECTURE.md` доступен
 * только «Просмотр» — по аналогии с подтверждённым `403` на
 * `PUT /payroll/settings` под директором, отдельно для бухгалтерии не
 * перепроверялось в этом раунде.
 */
export function canManageFinance(role: Role): boolean {
  return role === 'accountant'
}

/**
 * Подтверждено полем `periodClosed` в живом ответе — сервер её и так
 * отклонит, но кнопки лучше не показывать заранее. Разрешаем правку только
 * при явном `false`: если сервер не прислал поле или прислало не булево
 * (`null`), это неизвестное состояние — не «месяц открыт» — и правку лучше
 * не предлагать, а не угадывать в пользу разрешения.
 */
export function isTransactionEditable(transaction: {
  periodClosed: Transaction['periodClosed']
}): boolean {
  return transaction.periodClosed === false
}

/**
 * Полная проверка права на `PATCH`/загрузку вложения: подтверждено
 * описанием маршрута в опубликованной схеме API 0.3.0 — "Изменить операцию
 * (бухгалтер, только свою и до закрытия месяца)". «Свою» — значит запись,
 * которую создал именно этот бухгалтер, а не любую; отдельным живым
 * запросом не перепроверялось (нет второго тестового аккаунта бухгалтера).
 * `createdById: null` (сервер не прислал поле) — как и с `periodClosed`,
 * неизвестное состояние не разрешает правку.
 */
export function canEditTransaction(
  role: Role,
  currentUserId: string | null | undefined,
  transaction: {
    periodClosed: Transaction['periodClosed']
    createdById: Transaction['createdById']
  },
): boolean {
  return (
    canManageFinance(role) &&
    isTransactionEditable(transaction) &&
    transaction.createdById !== null &&
    transaction.createdById === currentUserId
  )
}
