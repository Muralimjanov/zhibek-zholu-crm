'use client'

import { useMemo } from 'react'
import { useUsersQuery } from '@/features/users/queries'
import type { UserRole } from '@/types/auth'
import { canListUsers } from './access'

/** Ничего не раскрывает и не совпадает с настоящим ФИО или id. */
const MANAGER_UNAVAILABLE = 'Менеджер недоступен'

/**
 * Показывает ФИО ответственного менеджера вместо сырого `managerId`.
 *
 * Директор и начальник продаж могут прочитать `GET /users` — по нему строим
 * справочник `id → fullName`. Менеджеру `GET /users` отвечает 403, поэтому
 * для него запрос не делаем вовсе: он видит только свои брони, и managerId
 * там всегда равен его собственному id, что проверяем локально через сессию.
 *
 * Собственный id проверяем ПЕРВЫМ, до похода в справочник: при создании
 * брони без выбора менеджера сервер вправе назначить ответственным самого
 * создателя (например, начальника продаж), а `GET /users` для него отдаёт
 * только его команду, не его самого — без этой проверки такая бронь
 * показывала бы «недоступен» вместо «Вы».
 *
 * `managerId` наружу из этого модуля не возвращается — только имя или
 * нейтральный текст.
 */
export function useManagerDisplayName(
  role: UserRole | null | undefined,
  currentUserId: string | null | undefined,
) {
  const canLookup = canListUsers(role)
  const usersQuery = useUsersQuery(canLookup)

  return useMemo(() => {
    const names = new Map<string, string>()

    for (const person of usersQuery.data ?? []) {
      names.set(person.id, person.fullName)
    }

    return (managerId: string | null): string => {
      if (!managerId) {
        return '—'
      }

      if (currentUserId && managerId === currentUserId) {
        return 'Вы'
      }

      if (canLookup) {
        return names.get(managerId) ?? MANAGER_UNAVAILABLE
      }

      return MANAGER_UNAVAILABLE
    }
  }, [canLookup, usersQuery.data, currentUserId])
}
