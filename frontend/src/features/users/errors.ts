import { describeApiError } from '@/features/auth/error-messages'
import { ApiError } from '@/lib/api/client'

/** На `/confirmations/{id}/confirm` 401 — это неверный код, а не сессия. */
export function describeConfirmError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Неверный код. Проверьте письмо и попробуйте ещё раз — после пяти неверных попыток запрос будет отклонён.'
    }

    if (error.status === 404) {
      return 'Запрос не найден. Возможно, он уже подтверждён или отклонён.'
    }

    if (error.status === 409) {
      return 'Запрос уже не ожидает подтверждения: он подтверждён, отклонён или истёк.'
    }
  }

  return describeApiError(error)
}

export function describeCreateUserError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return error.code === 'USER_ROLE_CREATION_FORBIDDEN'
        ? 'Вам не разрешено создавать аккаунты с этой ролью.'
        : 'Недостаточно прав для создания аккаунта.'
    }

    if (error.status === 409) {
      return 'Такой логин уже занят. Выберите другой.'
    }
  }

  return describeApiError(error)
}
