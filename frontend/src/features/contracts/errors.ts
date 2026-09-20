import { describeApiError } from '@/features/auth/error-messages'
import { ApiError } from '@/lib/api/client'
import { ContractListContractError } from './parse'

const SIGNED_READ_ONLY = 'CONTRACT_SIGNED_READ_ONLY'

/**
 * 404 приходит и когда договора нет, и когда он чужой. Формулировка одна и
 * та же намеренно: интерфейс не должен раскрывать существование чужого
 * договора.
 */
export function describeContractError(error: unknown): string {
  if (error instanceof ContractListContractError) {
    return 'Сервер вернул данные в неожиданном формате. Обновите страницу и повторите.'
  }

  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'Договор не найден или недоступен.'
    }

    if (error.status === 403) {
      if (error.code === SIGNED_READ_ONLY) {
        return 'Договор подписан: изменения запрещены.'
      }

      return error.code === 'CONSENT_REQUIRED'
        ? 'Нужно принять обязательные документы, чтобы работать с договорами.'
        : 'Недостаточно прав для этого действия.'
    }

    if (error.status === 409) {
      return 'Состояние договора изменилось на сервере. Обновите страницу и повторите.'
    }

    if (error.status === 413) {
      return 'Файл слишком большой для сервера.'
    }
  }

  return describeApiError(error)
}
