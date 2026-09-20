import { describeApiError } from '@/features/auth/error-messages'
import { ApiError } from '@/lib/api/client'
import {
  CurrentShiftContractError,
  DayOffListContractError,
  ShiftListContractError,
} from './parse'

const DAY_OFF_ALREADY_EXISTS = 'DAY_OFF_ALREADY_EXISTS'
const DAY_OFF_DATE_IN_PAST = 'DAY_OFF_DATE_IN_PAST'

export function describeShiftError(error: unknown): string {
  if (
    error instanceof ShiftListContractError ||
    error instanceof DayOffListContractError ||
    error instanceof CurrentShiftContractError
  ) {
    return 'Сервер вернул данные в неожиданном формате. Обновите страницу и повторите.'
  }

  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Недостаточно прав для этого действия.'
    }

    if (error.status === 404) {
      return 'Запись не найдена или недоступна.'
    }

    if (error.status === 409) {
      return error.code === DAY_OFF_ALREADY_EXISTS
        ? 'На эту дату сотруднику уже согласован выходной.'
        : 'Смена уже в этом состоянии на сервере. Обновите страницу.'
    }

    if (error.status === 400 && error.code === DAY_OFF_DATE_IN_PAST) {
      return 'Нельзя согласовать выходной на прошедшую дату.'
    }
  }

  return describeApiError(error)
}
