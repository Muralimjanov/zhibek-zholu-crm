import { confirmedRequest } from '@/features/auth/confirmedRequest'
import { authorizedRequest } from '@/features/auth/session'
import type {
  ContractListQuery,
  ConvertBookingRequest,
  CreateContractRequest,
  UpdateContractRequest,
} from '@/types/contract'

function buildListQuery(query: ContractListQuery): string {
  const params = new URLSearchParams()

  if (query.status) {
    params.set('status', query.status)
  }

  if (query.managerId) {
    params.set('managerId', query.managerId)
  }

  // Точный поиск: сервер ищет по слепому индексу, локальной фильтрации нет.
  if (query.passportNumber) {
    params.set('passportNumber', query.passportNumber)
  }

  if (query.phone) {
    params.set('phone', query.phone)
  }

  params.set('limit', String(query.limit))
  params.set('offset', String(query.offset))

  return params.toString()
}

export function fetchContracts(query: ContractListQuery) {
  return authorizedRequest<unknown>(`/contracts?${buildListQuery(query)}`)
}

export function fetchContract(id: string) {
  return authorizedRequest<unknown>(`/contracts/${encodeURIComponent(id)}`)
}

export function createContract(input: CreateContractRequest) {
  return authorizedRequest<unknown>('/contracts', {
    method: 'POST',
    json: input,
  })
}

export function convertBooking(
  bookingId: string,
  input: ConvertBookingRequest,
) {
  return authorizedRequest<unknown>(
    `/bookings/${encodeURIComponent(bookingId)}/convert`,
    { method: 'POST', json: input },
  )
}

export function updateContract(id: string, input: UpdateContractRequest) {
  return authorizedRequest<unknown>(`/contracts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: input,
  })
}

/**
 * Защищено кодом на почту с API 0.2.0 (`action: "contract.deposit"`,
 * `resourceId` = id договора) — `headers` собирает вызывающий код через
 * `confirmationHeaders()`. `confirmedRequest` (не `authorizedRequest`):
 * 401 здесь может значить неверный код, а не истёкшую сессию — повторять
 * запрос и выходить из CRM по такому 401 нельзя.
 */
export function markDeposit(id: string, paid: true, headers: HeadersInit) {
  return confirmedRequest<unknown>(
    `/contracts/${encodeURIComponent(id)}/deposit`,
    { method: 'POST', json: { paid }, headers },
  )
}

export const CONTRACT_FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
]

/**
 * 10 МБ — не догадка по аналогии с аватаром: это общий предел файлов API
 * (`API_TESTING.md`, чек-лист безопасности: «файл > 10 МБ → 413»).
 */
export const CONTRACT_FILE_MAX_BYTES = 10 * 1024 * 1024

/**
 * Multipart: Content-Type с boundary проставляет браузер. Защищено кодом на
 * почту с API 0.2.0 (`action: "contract.file"`, `resourceId` = id
 * договора) — `headers` собирает вызывающий код. `confirmedRequest` — та же
 * причина, что у `markDeposit`: 401 здесь может значить неверный код.
 */
export function uploadContractFile(
  id: string,
  file: File,
  headers: HeadersInit,
) {
  const formData = new FormData()

  formData.append('file', file)

  return confirmedRequest<unknown>(
    `/contracts/${encodeURIComponent(id)}/file`,
    {
      method: 'PUT',
      body: formData,
      headers,
    },
  )
}

/** Файл отдаётся только по Bearer-токену, поэтому грузим его как blob. */
export function fetchContractFile(id: string) {
  return authorizedRequest<Blob>(`/contracts/${encodeURIComponent(id)}/file`, {
    responseType: 'blob',
  })
}

export function validateContractFile(file: File): string | null {
  if (!CONTRACT_FILE_MIME_TYPES.includes(file.type)) {
    return 'Допустимы только PDF, JPEG и PNG.'
  }

  if (file.size > CONTRACT_FILE_MAX_BYTES) {
    return 'Файл больше 10 МБ.'
  }

  return null
}
