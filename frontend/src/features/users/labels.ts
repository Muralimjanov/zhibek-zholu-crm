import type { BadgeTone } from '@/components/ui/Badge'

/**
 * Перечисление статусов в OpenAPI не опубликовано: известные значения
 * переводим, неизвестное показываем как есть.
 */
const STATUS_LABELS: Record<string, string> = {
  active: 'Активен',
  disabled: 'Отключён',
  pending: 'Ожидает',
  blocked: 'Заблокирован',
}

export function formatUserStatus(status: string): string {
  return STATUS_LABELS[status] ?? status
}

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'success',
  disabled: 'neutral',
  pending: 'warning',
  blocked: 'danger',
}

export function userStatusTone(status: string): BadgeTone {
  return STATUS_TONE[status] ?? 'neutral'
}

const ACTION_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждён',
  rejected: 'Отклонён',
  failed: 'Отклонён из-за неверных кодов',
  expired: 'Истёк',
}

export function formatActionStatus(status: string): string {
  return ACTION_STATUS_LABELS[status] ?? status
}

/** Типы подтверждаемых действий; поддержан пока только `create_user`. */
const ACTION_TYPE_LABELS: Record<string, string> = {
  create_user: 'Создание аккаунта',
}

export function formatActionType(type: string): string {
  return ACTION_TYPE_LABELS[type] ?? type
}

export function formatDateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
