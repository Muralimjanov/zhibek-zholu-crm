import type { KnownUserRole, User, UserRole } from '@/types/auth'

type Role = UserRole | null | undefined

/** Бухгалтер и инвестор получают 403 на `GET /bookings`. */
export function canViewBookings(role: Role): boolean {
  return (
    role === 'director' || role === 'head_of_sales' || role === 'sales_manager'
  )
}

/**
 * Правило `managerId` подтверждено в OpenAPI 0.2.0 — описание поля в
 * `CreateBookingDto` и `CreateContractDto` дословно совпадает:
 * - `director`: ОБЯЗАН выбрать; любой активный `sales_manager` или
 *   `head_of_sales`. Нет поля → 400 `MANAGER_ID_REQUIRED`.
 * - `head_of_sales`: необязателен, по умолчанию он сам; можно себя либо
 *   активного менеджера своей команды.
 * - `sales_manager`: не передаётся вовсе — сервер всегда назначает его.
 */
export function managerRequiredOnCreate(role: Role): boolean {
  return role === 'director'
}

/** Показывать ли выбор менеджера вообще (директору — обязательный, начальнику продаж — необязательный). */
export function managerSelectableOnCreate(role: Role): boolean {
  return role === 'director' || role === 'head_of_sales'
}

/** Роли, которые можно выбрать в списке `GET /users` (сам список уже ограничен сервером по команде). */
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

/**
 * Переназначение ответственного в уже существующей записи: то же правило,
 * что и при создании, — доступно директору и начальнику продаж.
 */
export function canReassignManager(role: Role): boolean {
  return role === 'director' || role === 'head_of_sales'
}

/** `GET /users` доступен не всем ролям: менеджер получает 403. */
export function canListUsers(role: Role): boolean {
  return role === 'director' || role === 'head_of_sales'
}
