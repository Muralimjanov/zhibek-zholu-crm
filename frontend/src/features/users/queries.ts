'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { showToast } from '@/components/ui/toast-store'
import { useSession } from '@/features/auth/useSession'
import type { CreateUserRequest } from '@/types/users'
import {
  confirmAction,
  fetchPendingActions,
  fetchUsers,
  rejectAction,
  requestUserCreation,
} from './api'
import { readPendingActions } from './pending'

/**
 * Ключи привязаны к идентификатору пользователя: это дополнительная граница
 * между ролями. Основная защита — очистка кеша при сбросе сессии в
 * `QueryProvider`.
 */
const ANONYMOUS = 'anonymous'

export const usersQueryKey = (userId: string) => ['users', userId] as const

export const pendingActionsQueryKey = (userId: string) =>
  ['confirmations', 'pending', userId] as const

function useCurrentUserId(): string | null {
  const { user } = useSession()

  return user?.id ?? null
}

export function useUsersQuery(enabled: boolean) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: usersQueryKey(userId ?? ANONYMOUS),
    queryFn: fetchUsers,
    enabled: enabled && userId !== null,
    retry: false,
  })
}

export function usePendingActionsQuery(enabled: boolean) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: pendingActionsQueryKey(userId ?? ANONYMOUS),
    queryFn: async () => readPendingActions(await fetchPendingActions()),
    enabled: enabled && userId !== null,
    retry: false,
  })
}

export function useRequestUserCreation() {
  const queryClient = useQueryClient()
  const userId = useCurrentUserId() ?? ANONYMOUS

  return useMutation({
    mutationFn: (input: CreateUserRequest) => requestUserCreation(input),
    onSuccess: () => {
      // 202 — это только запрос, аккаунт появится после подтверждения кодом.
      showToast('Запрос отправлен на подтверждение')

      // Пользователя ещё нет: обновляем только очередь подтверждений.
      // Промис возвращается (как в bookings/contracts/shifts/payroll/finance),
      // чтобы мутация оставалась `isPending` до реального обновления очереди.
      return queryClient.invalidateQueries({
        queryKey: pendingActionsQueryKey(userId),
      })
    },
  })
}

export function useConfirmAction() {
  const queryClient = useQueryClient()
  const userId = useCurrentUserId() ?? ANONYMOUS

  return useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      confirmAction(id, code),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: usersQueryKey(userId) }),
        queryClient.invalidateQueries({
          queryKey: pendingActionsQueryKey(userId),
        }),
      ]),
  })
}

export function useRejectAction() {
  const queryClient = useQueryClient()
  const userId = useCurrentUserId() ?? ANONYMOUS

  return useMutation({
    mutationFn: (id: string) => rejectAction(id),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: pendingActionsQueryKey(userId),
      }),
  })
}
