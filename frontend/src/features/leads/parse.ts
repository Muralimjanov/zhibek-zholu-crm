import type { Lead, LeadPage, LeadStatus } from '@/types/lead'

/**
 * Разбор ответов раздела лидов. Список приходит конвертом
 * `{ items, total, limit, offset }` — как у броней, договоров и смен.
 * Запись с непонятной формой отбрасывается, а не показывается наполовину.
 */

const STATUSES: LeadStatus[] = ['new', 'assigned', 'converted', 'rejected']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() === '' ? null : value
  }

  return null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStatus(value: unknown): LeadStatus | null {
  return typeof value === 'string' && (STATUSES as string[]).includes(value)
    ? (value as LeadStatus)
    : null
}

export function readLead(payload: unknown): Lead | null {
  if (!isRecord(payload)) {
    return null
  }

  const id = readString(payload.id)
  const status = readStatus(payload.status)
  const firstName = readString(payload.firstName)
  const lastName = readString(payload.lastName)
  const createdAt = readString(payload.createdAt)

  if (!id || !status || !firstName || !lastName || !createdAt) {
    return null
  }

  return {
    id,
    firstName,
    lastName,
    phone: readString(payload.phone) ?? '',
    desiredAreaSqm: readString(payload.desiredAreaSqm) ?? '0',
    comment: readString(payload.comment),
    status,
    createdById: readString(payload.createdById) ?? '',
    assignedManagerId: readString(payload.assignedManagerId),
    assignedAt: readString(payload.assignedAt),
    bookingId: readString(payload.bookingId),
    createdAt,
    updatedAt: readString(payload.updatedAt) ?? createdAt,
  }
}

export function readLeadPage(payload: unknown): LeadPage {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return { items: [], total: 0, limit: 0, offset: 0 }
  }

  const items = payload.items
    .map((item) => readLead(item))
    .filter((item): item is Lead => item !== null)

  return {
    items,
    total: readNumber(payload.total) ?? items.length,
    limit: readNumber(payload.limit) ?? items.length,
    offset: readNumber(payload.offset) ?? 0,
  }
}
