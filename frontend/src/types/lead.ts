/**
 * Обращение с ресепшена — первый шаг воронки лид → бронь → договор.
 * Форма ответов соответствует API 0.4.0 (`GET /leads`, `POST /leads`).
 */

export type LeadStatus = 'new' | 'assigned' | 'converted' | 'rejected'

export interface Lead {
  id: string
  firstName: string
  lastName: string
  phone: string
  /** Строка с двумя знаками после точки, например `72.50`. */
  desiredAreaSqm: string
  comment: string | null
  status: LeadStatus
  createdById: string
  assignedManagerId: string | null
  assignedAt: string | null
  /** Заполняется, когда лид превращён в бронь. */
  bookingId: string | null
  createdAt: string
  updatedAt: string
}

export interface LeadListQuery {
  status?: LeadStatus
  managerId?: string
  limit?: number
  offset?: number
}

export interface LeadPage {
  items: Lead[]
  total: number
  limit: number
  offset: number
}

/** Поля формы ресепшена. Согласие клиент подтверждает на той же форме. */
export interface CreateLeadRequest {
  firstName: string
  lastName: string
  phone: string
  desiredAreaSqm: string
  comment?: string
  buyerConsentConfirmed: true
  buyerConsentVersion: string
}

export interface ConvertLeadRequest {
  passportNumber: string
  email?: string
  buyerConsentConfirmed: true
  buyerConsentVersion: string
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Новое',
  assigned: 'У менеджера',
  converted: 'Стал бронью',
  rejected: 'Отказ',
}
