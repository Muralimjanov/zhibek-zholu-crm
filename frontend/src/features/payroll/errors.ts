import { describeApiError } from '@/features/auth/error-messages'
import { ApiError } from '@/lib/api/client'
import {
  PayrollEntryContractError,
  PayrollEntryListContractError,
  PayrollSettingsContractError,
} from './parse'

const PAYROLL_ENTRY_CONFIRMED = 'PAYROLL_ENTRY_CONFIRMED'

export function describePayrollError(error: unknown): string {
  if (
    error instanceof PayrollSettingsContractError ||
    error instanceof PayrollEntryListContractError ||
    error instanceof PayrollEntryContractError
  ) {
    return 'Сервер вернул данные в неожиданном формате. Обновите страницу и повторите.'
  }

  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Недостаточно прав для этого действия.'
    }

    if (error.status === 404) {
      return 'Начисление не найдено или недоступно.'
    }

    if (error.status === 409) {
      return error.code === PAYROLL_ENTRY_CONFIRMED
        ? 'Начисление уже подтверждено — править и подтверждать повторно нельзя.'
        : 'Данные изменились на сервере. Обновите страницу и повторите.'
    }
  }

  return describeApiError(error)
}
