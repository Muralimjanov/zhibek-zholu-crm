import { authorizedRequest } from '@/features/auth/session'
import type {
  ConvertLeadRequest,
  CreateLeadRequest,
  LeadListQuery,
} from '@/types/lead'

function buildQuery(params: object): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value))
    }
  }

  return search.toString()
}

export function fetchLeads(query: LeadListQuery) {
  const search = buildQuery(query)

  return authorizedRequest<unknown>(search ? `/leads?${search}` : '/leads')
}

export function createLead(input: CreateLeadRequest) {
  return authorizedRequest<unknown>('/leads', { method: 'POST', json: input })
}

export function assignLead(id: string, managerId: string) {
  return authorizedRequest<unknown>(
    `/leads/${encodeURIComponent(id)}/assign`,
    { method: 'PATCH', json: { managerId } },
  )
}

export function rejectLead(id: string) {
  return authorizedRequest<unknown>(
    `/leads/${encodeURIComponent(id)}/reject`,
    { method: 'PATCH' },
  )
}

export function convertLead(id: string, input: ConvertLeadRequest) {
  return authorizedRequest<unknown>(
    `/leads/${encodeURIComponent(id)}/convert`,
    { method: 'POST', json: input },
  )
}
