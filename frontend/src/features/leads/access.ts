import type { UserRole } from '@/types/auth'

type Role = UserRole | null | undefined

/**
 * Права на лиды повторяют серверные (`LeadsService.scope`, API 0.4.0).
 * Источник истины — сервер; фронт только скрывает недоступное.
 */

/** Форму заполняет ресепшен. */
export function canCreateLead(role: Role): boolean {
  return role === 'reception'
}

/** Раздел «Лиды» виден всем, кто хоть что-то в нём видит. */
export function canViewLeadsSection(role: Role): boolean {
  return (
    role === 'reception' ||
    role === 'sales_manager' ||
    role === 'head_of_sales' ||
    role === 'director'
  )
}

/** Менеджера назначает только начальник продаж и только из своей команды. */
export function canAssignLead(role: Role): boolean {
  return role === 'head_of_sales'
}

/** Превращает лид в бронь менеджер, которому он назначен, или начальник продаж. */
export function canConvertLead(role: Role): boolean {
  return role === 'head_of_sales' || role === 'sales_manager'
}

export function canRejectLead(role: Role): boolean {
  return role === 'head_of_sales' || role === 'sales_manager'
}

/**
 * У директора в этом разделе только чтение: решением владельца 22.09.2026
 * всё редактирование, кроме отчётности и аккаунтов, у него убрано.
 */
export function isLeadsReadOnly(role: Role): boolean {
  return role === 'director'
}
