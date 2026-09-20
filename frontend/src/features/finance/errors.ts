import { describeApiError } from '@/features/auth/error-messages'
import { ApiError } from '@/lib/api/client'
import {
  AccountingSummaryContractError,
  TransactionContractError,
  TransactionListContractError,
} from './parse'

export function describeFinanceError(error: unknown): string {
  if (
    error instanceof TransactionListContractError ||
    error instanceof TransactionContractError ||
    error instanceof AccountingSummaryContractError
  ) {
    return 'Сервер вернул данные в неожиданном формате. Обновите страницу и повторите.'
  }

  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Недостаточно прав для этого действия.'
    }

    if (error.status === 404) {
      return 'Операция не найдена или недоступна.'
    }

    if (error.status === 409) {
      return 'Месяц записи закрыт для правок или данные изменились на сервере. Обновите страницу.'
    }

    if (error.status === 413) {
      return 'Сервер отклонил запрос: файл слишком большой.'
    }
  }

  return describeApiError(error)
}
