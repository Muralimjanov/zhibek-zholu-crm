import type { UserRole } from '@/types/auth'
import type { PayrollEntry } from '@/types/payroll'

type Role = UserRole | null | undefined

/**
 * Живьём подтверждено (`PAYROLL_API_EXAMPLES.md`): `GET /payroll/settings`
 * отвечает 200 и директору, и бухгалтеру. Директору показываем настройки
 * только для чтения — писать он не может (см. `canManagePayroll`).
 */
export function canViewPayrollSettings(role: Role): boolean {
  return role === 'director' || role === 'accountant'
}

/**
 * Единственная подтверждённая живьём пишущая роль: `PUT /payroll/settings`
 * под директором вернул `403 AUTH_FORBIDDEN`, под тестовым бухгалтером —
 * 200. Та же роль подтверждена для генерации месяца, ручной коррекции
 * черновика и подтверждения начисления.
 */
export function canManagePayroll(role: Role): boolean {
  return role === 'accountant'
}

/**
 * Роли с собственной зарплатой. Для бухгалтера собственная запись
 * подтверждена живьём (тестовый бухгалтер подтвердил своё же начисление).
 * `sales_manager` — по дословному тексту описания `GET /payroll/entries` в
 * OpenAPI («Sales managers see only their own entries»), отдельным живым
 * вызовом не проверялся.
 *
 * `head_of_sales` **исключён** — вопреки предположению
 * `FRONTEND_ARCHITECTURE.md` о «своей зарплате», живая проверка 18.09.2026
 * (`RELEASE_READINESS_REVIEW.md`) показала `403 AUTH_FORBIDDEN` на
 * `GET /payroll/entries` под тестовым `test_hos`: сервер не даёт этой роли
 * даже собственную запись через этот маршрут.
 */
export function canViewOwnPayroll(role: Role): boolean {
  return role === 'sales_manager' || role === 'accountant'
}

/**
 * Директор видит список начислений целиком, не только свою запись (которой
 * у него и нет). Подтверждено живьём 2026-09-18: `GET /payroll/entries` под
 * директором вернул `200` с записью бухгалтера (не `403` и не пустой
 * список) — сервер не сужает этот GET директору так же, как `sales_manager`
 * (дословно «Sales managers see only their own entries» в OpenAPI).
 */
export function canViewAllPayrollEntries(role: Role): boolean {
  return canManagePayroll(role) || role === 'director'
}

/**
 * Раздел «Зарплата» виден тем, кто может что-то в нём увидеть: настройки
 * (директор, бухгалтер), все начисления (директор, бухгалтер) или свою
 * запись (менеджер, бухгалтер). Доступ инвестора к
 * записям начислений в этом этапе не проверялся и не реализован.
 */
export function canViewPayrollSection(role: Role): boolean {
  return (
    canViewPayrollSettings(role) ||
    canViewOwnPayroll(role) ||
    canViewAllPayrollEntries(role)
  )
}

/** Подтверждена только для `status: "draft"` — на `confirmed` сервер отвечает 409. */
export function isPayrollEntryEditable(entry: {
  status: PayrollEntry['status']
}): boolean {
  return entry.status === 'draft'
}

export function canCorrectPayrollEntry(
  role: Role,
  entry: { status: PayrollEntry['status'] },
): boolean {
  return canManagePayroll(role) && isPayrollEntryEditable(entry)
}

export function canConfirmPayrollEntry(
  role: Role,
  entry: { status: PayrollEntry['status'] },
): boolean {
  return canManagePayroll(role) && isPayrollEntryEditable(entry)
}
