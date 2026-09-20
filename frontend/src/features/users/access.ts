import type { KnownUserRole, UserRole } from '@/types/auth'

type Role = UserRole | null | undefined

/** `GET /users` доступен только директору и начальнику продаж. */
export function canViewUsers(role: Role): boolean {
  return role === 'director' || role === 'head_of_sales'
}

/** Директор видит всех, начальник продаж — свою команду. */
export function usersNavLabel(role: Role): string | null {
  if (role === 'director') {
    return 'Пользователи'
  }

  if (role === 'head_of_sales') {
    return 'Команда'
  }

  return null
}

/**
 * Роли, которые текущий пользователь может запросить к созданию.
 *
 * По ТЗ директор создаёт начальника продаж, бухгалтера и инвесторов, а
 * начальник продаж — менеджеров. Создание второго директора и создание
 * менеджера напрямую директором в ТЗ не описаны, поэтому их здесь нет:
 * добавим, когда backend подтвердит правило.
 */
export function creatableRoles(role: Role): KnownUserRole[] {
  if (role === 'director') {
    return ['head_of_sales', 'accountant', 'investor']
  }

  if (role === 'head_of_sales') {
    return ['sales_manager']
  }

  return []
}

/** Подтверждает и отклоняет запросы только директор. */
export function canConfirmActions(role: Role): boolean {
  return role === 'director'
}
