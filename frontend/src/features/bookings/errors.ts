import { describeApiError } from '@/features/auth/error-messages'
import { ApiError } from '@/lib/api/client'
import { BookingListContractError } from './parse'

/**
 * 404 приходит и когда брони нет, и когда она чужая. Формулировка одна и та
 * же намеренно: интерфейс не должен раскрывать существование чужой брони.
 */
export function describeBookingError(error: unknown): string {
  if (error instanceof BookingListContractError) {
    return 'Сервер вернул данные в неожиданном формате. Обновите страницу и повторите.'
  }

  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'Бронь не найдена или недоступна.'
    }

    if (error.status === 403) {
      return error.code === 'CONSENT_REQUIRED'
        ? 'Нужно принять обязательные документы, чтобы работать с бронированиями.'
        : 'Недостаточно прав для этого действия.'
    }

    if (error.status === 409) {
      return 'Состояние брони изменилось на сервере. Обновите страницу и повторите.'
    }
  }

  return describeApiError(error)
}
