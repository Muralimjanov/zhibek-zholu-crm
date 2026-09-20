import { authorizedRequest } from '@/features/auth/session'
import { confirmedRequest } from '@/features/auth/confirmedRequest'
import type {
  CorrectPayrollEntryRequest,
  GeneratePayrollEntriesRequest,
  PayrollEntryListQuery,
  UpdatePayrollSettingsRequest,
} from '@/types/payroll'

function buildQuery(params: object): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value))
    }
  }

  return search.toString()
}

/** Пустое тело до первой настройки — см. `readPayrollSettings`. */
export function fetchPayrollSettings() {
  return authorizedRequest<unknown>('/payroll/settings')
}

/**
 * Защищено кодом на почту (`payroll.settings.update`) — заголовки собирает
 * вызывающий код через `useEmailCodeConfirm`. `confirmedRequest`, а не
 * `authorizedRequest`: 401 здесь может значить неверный код, а не
 * истёкшую сессию — автоматический повтор или выход из сессии были бы
 * ошибкой.
 */
export function updatePayrollSettings(
  input: UpdatePayrollSettingsRequest,
  headers: HeadersInit,
) {
  return confirmedRequest<unknown>('/payroll/settings', {
    method: 'PUT',
    json: input,
    headers,
  })
}

/** Код не нужен — подтверждено OpenAPI (нет `x-confirmation-*` параметров). */
export function generatePayrollEntries(input: GeneratePayrollEntriesRequest) {
  return authorizedRequest<unknown>('/payroll/entries/generate', {
    method: 'POST',
    json: input,
  })
}

export function fetchPayrollEntries(query: PayrollEntryListQuery) {
  const search = buildQuery(query)

  return authorizedRequest<unknown>(
    search ? `/payroll/entries?${search}` : '/payroll/entries',
  )
}

export function fetchPayrollEntry(id: string) {
  return authorizedRequest<unknown>(`/payroll/entries/${id}`)
}

/** Код не нужен — подтверждено OpenAPI. Отклоняется 409, если запись уже `confirmed`. */
export function correctPayrollEntry(
  id: string,
  input: CorrectPayrollEntryRequest,
) {
  return authorizedRequest<unknown>(`/payroll/entries/${id}`, {
    method: 'PATCH',
    json: input,
  })
}

/** Защищено кодом на почту (`payroll.confirm`, `resourceId: id`) — та же причина, что у `updatePayrollSettings`. */
export function confirmPayrollEntry(id: string, headers: HeadersInit) {
  return confirmedRequest<unknown>(`/payroll/entries/${id}/confirm`, {
    method: 'POST',
    headers,
  })
}
