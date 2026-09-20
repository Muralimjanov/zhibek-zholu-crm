import { authorizedRequest } from '@/features/auth/session'
import { apiRequest } from '@/lib/api/client'
import type {
  LegalDocument,
  LegalDocumentSummary,
  RecordConsentRequest,
} from '@/types/legal'

/** Список документов доступен без токена (проверено на staging). */
export function requestLegalDocuments() {
  return apiRequest<LegalDocumentSummary[]>('/legal/documents')
}

export function requestLegalDocument(type: string) {
  return apiRequest<LegalDocument>(
    `/legal/documents/${encodeURIComponent(type)}`,
  )
}

export function submitConsent(input: RecordConsentRequest) {
  return authorizedRequest<unknown>('/consents', {
    method: 'POST',
    json: input,
  })
}
