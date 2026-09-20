import type { KnownUserRole, User, UserRole } from '@/types/auth'
import type { Contract } from '@/types/contract'

type Role = UserRole | null | undefined

/**
 * `GET /contracts` доступен директору, начальнику продаж, менеджеру и
 * бухгалтеру (бухгалтеру — финансовое представление без ФИО/паспорта/адреса,
 * подтверждено описанием операции в OpenAPI). Инвестор получает 403
 * (`API_TESTING.md`, 6.4).
 */
export function canViewContracts(role: Role): boolean {
  return (
    role === 'director' ||
    role === 'head_of_sales' ||
    role === 'sales_manager' ||
    role === 'accountant'
  )
}

/** Бухгалтеру показываем отдельный, урезанный экран без персональных данных. */
export function isAccountantView(role: Role): boolean {
  return role === 'accountant'
}

/**
 * `GET /contracts/{id}` для бухгалтера не проверен на staging (см.
 * `CLAUDE_CONTRACTS_TASK.md`: «не запрашивай полную карточку, пока не
 * проверено, что ответ... для бухгалтера также безопасен»). Пока это не
 * подтверждено, бухгалтер работает только со списком и точечным действием
 * подтверждения взноса прямо в строке таблицы — карточку не открываем и
 * запрос за ней не делаем вовсе.
 */
export function canViewContractDetail(role: Role): boolean {
  return (
    role === 'director' || role === 'head_of_sales' || role === 'sales_manager'
  )
}

/**
 * Точный поиск по паспорту/телефону бухгалтеру не положен
 * (`GET /contracts?passportNumber=...` → 403 под `demo_accountant`,
 * `API_TESTING.md` 6.4).
 */
export function canSearchContracts(role: Role): boolean {
  return canViewContracts(role) && !isAccountantView(role)
}

/**
 * Правило `managerId` подтверждено в OpenAPI 0.2.0 — описание поля в
 * `CreateContractDto` дословно совпадает с `CreateBookingDto` (см.
 * `bookings/access.ts`):
 * - `director`: ОБЯЗАН выбрать; любой активный `sales_manager` или
 *   `head_of_sales`. Нет поля → 400 `MANAGER_ID_REQUIRED`.
 * - `head_of_sales`: необязателен, по умолчанию он сам; можно себя либо
 *   активного менеджера своей команды.
 * - `sales_manager`: не передаётся вовсе — сервер всегда назначает его.
 */
export function managerRequiredOnCreate(role: Role): boolean {
  return role === 'director'
}

/** Показывать ли выбор менеджера вообще. */
export function managerSelectableOnCreate(role: Role): boolean {
  return role === 'director' || role === 'head_of_sales'
}

/** Роли, которые можно выбрать в списке `GET /users` (список уже ограничен сервером по команде). */
export function assignableManagerRoles(role: Role): KnownUserRole[] {
  if (role === 'director') {
    return ['sales_manager', 'head_of_sales']
  }

  if (role === 'head_of_sales') {
    return ['sales_manager']
  }

  return []
}

/** «Активный» по значению `status`, которое реально встречается в ответах API. */
export function isActiveStaff(user: Pick<User, 'status'>): boolean {
  return user.status === 'active'
}

/** Переназначение ответственного: то же правило, что и при создании. */
export function canReassignManager(role: Role): boolean {
  return role === 'director' || role === 'head_of_sales'
}

/** `GET /users` доступен директору и начальнику продаж; остальным — 403. */
export function canListUsers(role: Role): boolean {
  return role === 'director' || role === 'head_of_sales'
}

/**
 * После подписания менеджеру сервер отвечает 403 `CONTRACT_SIGNED_READ_ONLY`
 * (`API_TESTING.md`, 6.3) — про директора и начальника продаж такого
 * ограничения не описано, поэтому им редактирование не скрываем.
 */
export function canEditContract(role: Role, contract: Contract): boolean {
  if (role === 'director' || role === 'head_of_sales') {
    return true
  }

  if (role === 'sales_manager') {
    return contract.status !== 'signed'
  }

  return false
}

/**
 * Подтверждено backend-инструкцией для бухгалтера (6.4). Право директора и
 * начальника продаж не описано явно — показываем действие и им, окончательное
 * решение остаётся за сервером (403 не выдаём за успех).
 */
export function canConfirmDeposit(role: Role): boolean {
  return (
    role === 'accountant' || role === 'director' || role === 'head_of_sales'
  )
}

/**
 * Загрузка/скачивание подписанного файла не описаны по ролям явно. Бухгалтеру
 * их не показываем: его представление создано без персональных данных
 * покупателя, а файл договора их обычно содержит.
 */
export function canManageContractFile(role: Role): boolean {
  return (
    role === 'director' || role === 'head_of_sales' || role === 'sales_manager'
  )
}
