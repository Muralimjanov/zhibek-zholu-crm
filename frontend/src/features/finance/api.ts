import { confirmedRequest } from '@/features/auth/confirmedRequest'
import { authorizedRequest } from '@/features/auth/session'
import type {
  CreateTransactionRequest,
  TransactionListQuery,
  UpdateTransactionRequest,
} from '@/types/finance'

function buildQuery(params: object): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value))
    }
  }

  return search.toString()
}

export function fetchTransactions(query: TransactionListQuery) {
  return authorizedRequest<unknown>(`/transactions?${buildQuery(query)}`)
}

export function fetchTransaction(id: string) {
  return authorizedRequest<unknown>(`/transactions/${encodeURIComponent(id)}`)
}

/** Защищено кодом на почту (`transaction.create`) — заголовки собирает вызывающий код. */
export function createTransaction(
  input: CreateTransactionRequest,
  headers: HeadersInit,
) {
  return confirmedRequest<unknown>('/transactions', {
    method: 'POST',
    json: input,
    headers,
  })
}

/**
 * Защищено кодом на почту (`transaction.update`, `resourceId: id`). Согласно
 * описанию маршрута в схеме API 0.3.0, бухгалтер правит только свои записи
 * и до закрытия месяца — сервер отклонит остальное (403/409).
 */
export function updateTransaction(
  id: string,
  input: UpdateTransactionRequest,
  headers: HeadersInit,
) {
  return confirmedRequest<unknown>(`/transactions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: input,
    headers,
  })
}

/**
 * Multipart: Content-Type с boundary проставляет браузер (см. `client.ts`).
 * Защищено кодом на почту (`transaction.attachment`, `resourceId: id`) —
 * `confirmedRequest`, та же причина, что у `contracts/api.ts#uploadContractFile`.
 */
export function uploadTransactionAttachment(
  id: string,
  file: File,
  headers: HeadersInit,
) {
  const formData = new FormData()

  formData.append('file', file)

  return confirmedRequest<unknown>(
    `/transactions/${encodeURIComponent(id)}/attachment`,
    { method: 'PUT', body: formData, headers },
  )
}

/**
 * Файл отдаётся только по Bearer-токену, без кода подтверждения (см.
 * `FINANCE_API_EXAMPLES.md`) — по образцу `contracts/api.ts#fetchContractFile`.
 */
export function fetchTransactionAttachment(id: string) {
  return authorizedRequest<Blob>(
    `/transactions/${encodeURIComponent(id)}/attachment`,
    { responseType: 'blob' },
  )
}

export function fetchAccountingSummary(from: string, to: string) {
  return authorizedRequest<unknown>(
    `/accounting/summary?${buildQuery({ from, to })}`,
  )
}
