import type { UserRole } from '@/types/auth'

const ROLE_LABELS: Record<string, string> = {
  director: 'Директор',
  head_of_sales: 'Начальник отдела продаж',
  sales_manager: 'Менеджер',
  accountant: 'Бухгалтер',
  investor: 'Инвестор',
  reception: 'Ресепшен',
}

/** Перечисление ролей не опубликовано в OpenAPI: неизвестное значение показываем как есть. */
export function formatRole(role: UserRole): string {
  return ROLE_LABELS[role] ?? role
}
