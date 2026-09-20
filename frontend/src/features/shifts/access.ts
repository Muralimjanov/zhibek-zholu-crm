import type { KnownUserRole, UserRole } from '@/types/auth'

type Role = UserRole | null | undefined

/**
 * Собственную смену открывают менеджер, начальник продаж и бухгалтер.
 * Директор и инвестор получают 403 на `GET /shifts/current` и
 * `POST /shifts/open` — подтверждено фактически для директора
 * (`SHIFTS_API_EXAMPLES.md`).
 */
export function canHaveOwnShift(role: Role): boolean {
  return (
    role === 'sales_manager' ||
    role === 'head_of_sales' ||
    role === 'accountant'
  )
}

/**
 * Раздел «Смены» вообще показываем директору (согласование выходных,
 * посещаемость) и всем ролям с собственной сменой. Инвестору — нет: доступ
 * не подтверждён API_TESTING/OpenAPI для этого раздела.
 */
export function canViewShiftsSection(role: Role): boolean {
  return role === 'director' || canHaveOwnShift(role)
}

/** Директор и начальник продаж видят чужие смены (посещаемость команды). */
export function canViewTeamShifts(role: Role): boolean {
  return role === 'director' || role === 'head_of_sales'
}

/**
 * Согласование выходных: начальник продаж — менеджерам своей команды;
 * директор — начальнику продаж и бухгалтеру (решение владельца продукта,
 * зафиксировано в `FRONTEND_ARCHITECTURE.md`; подтверждено фактическим
 * `POST /day-offs` директора бухгалтеру в этой сессии).
 */
export function canCreateDayOff(role: Role): boolean {
  return role === 'director' || role === 'head_of_sales'
}

/** Роли, которым согласующий может назначить выходной. */
export function assignableDayOffRoles(role: Role): KnownUserRole[] {
  if (role === 'director') {
    return ['head_of_sales', 'accountant']
  }

  if (role === 'head_of_sales') {
    return ['sales_manager']
  }

  return []
}

/**
 * Раздел выходных виден всем, у кого есть смена, плюс тем, кто их
 * согласует. Право бухгалтера и инвестора на `GET /day-offs` в задании
 * отмечено как непроверенное — бухгалтеру раздел показываем (его роль
 * входит в `canHaveOwnShift`), окончательное решение всё равно за сервером;
 * инвестору — нет.
 */
export function canViewDayOffsSection(role: Role): boolean {
  return canViewShiftsSection(role)
}

/** `GET /users` доступен директору и начальнику продаж — для выбора, кому назначить выходной. */
export function canListUsers(role: Role): boolean {
  return role === 'director' || role === 'head_of_sales'
}

/** «Активный» по значению `status`, которое реально встречается в ответах API. */
export function isActiveStaff(user: { status: string }): boolean {
  return user.status === 'active'
}
