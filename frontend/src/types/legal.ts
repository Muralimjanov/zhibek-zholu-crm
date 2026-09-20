/** Поля подтверждены ответами `GET /legal/documents` staging от 17.09.2026. */
export interface LegalDocumentSummary {
  type: string
  version: string
  title: string
  audience: string
  draft: boolean
}

export interface LegalDocument extends LegalDocumentSummary {
  content: string
}

export interface RecordConsentRequest {
  policyType: string
  policyVersion: string
}
