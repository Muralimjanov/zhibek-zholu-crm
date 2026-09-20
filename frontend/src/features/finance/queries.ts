'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { showToast } from '@/components/ui/toast-store'
import { useSession } from '@/features/auth/useSession'
import type {
  CreateTransactionRequest,
  TransactionListQuery,
  UpdateTransactionRequest,
} from '@/types/finance'
import {
  createTransaction,
  fetchAccountingSummary,
  fetchTransaction,
  fetchTransactions,
  updateTransaction,
  uploadTransactionAttachment,
} from './api'
import {
  readAccountingSummary,
  readTransactionList,
  readTransactionOrThrow,
} from './parse'

/** Ключи привязаны к пользователю — как в `shifts`/`contracts`/`payroll`. */
const ANONYMOUS = 'anonymous'

export const transactionsListKey = (
  userId: string,
  query: TransactionListQuery,
) => ['finance', 'transactions', 'list', userId, query] as const

export const transactionKey = (userId: string, id: string) =>
  ['finance', 'transactions', 'item', userId, id] as const

export const accountingSummaryKey = (
  userId: string,
  from: string,
  to: string,
) => ['finance', 'summary', userId, from, to] as const

function useCurrentUserId(): string | null {
  const { user } = useSession()

  return user?.id ?? null
}

export function useTransactionsQuery(
  query: TransactionListQuery,
  enabled: boolean,
) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: transactionsListKey(userId ?? ANONYMOUS, query),
    queryFn: async () =>
      readTransactionList(await fetchTransactions(query), {
        limit: query.limit,
        offset: query.offset,
      }),
    enabled: enabled && userId !== null,
    retry: false,
  })
}

export function useTransactionQuery(id: string, enabled: boolean) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: transactionKey(userId ?? ANONYMOUS, id),
    queryFn: async () => readTransactionOrThrow(await fetchTransaction(id)),
    enabled: enabled && userId !== null && id !== '',
    retry: false,
  })
}

export function useAccountingSummaryQuery(
  from: string,
  to: string,
  enabled: boolean,
) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: accountingSummaryKey(userId ?? ANONYMOUS, from, to),
    queryFn: async () =>
      readAccountingSummary(await fetchAccountingSummary(from, to)),
    enabled: enabled && userId !== null && from !== '' && to !== '',
    retry: false,
  })
}

/**
 * `onSuccess` ВОЗВРАЩАЕТ промис инвалидации (как в исправлении
 * `shifts/queries.ts` и `payroll/queries.ts`) — мутация остаётся `isPending`
 * до реального обновления кеша списка, карточки и сводки, а не только до
 * ответа сервера.
 */
function useInvalidateFinance() {
  const queryClient = useQueryClient()
  const userId = useCurrentUserId() ?? ANONYMOUS

  return (id?: string) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['finance', 'transactions', 'list', userId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['finance', 'summary', userId],
      }),
      id
        ? queryClient.invalidateQueries({
            queryKey: transactionKey(userId, id),
          })
        : Promise.resolve(),
    ])
}

/** Защищено кодом на почту (`transaction.create`) — заголовки собирает вызывающий код. */
export function useCreateTransaction() {
  const invalidate = useInvalidateFinance()

  return useMutation({
    mutationFn: ({
      input,
      headers,
    }: {
      input: CreateTransactionRequest
      headers: HeadersInit
    }) => createTransaction(input, headers),
    onSuccess: () => {
      showToast('Операция создана')

      return invalidate()
    },
  })
}

/** Защищено кодом на почту (`transaction.update`, `resourceId: id`). */
export function useUpdateTransaction(id: string) {
  const invalidate = useInvalidateFinance()

  return useMutation({
    mutationFn: ({
      input,
      headers,
    }: {
      input: UpdateTransactionRequest
      headers: HeadersInit
    }) => updateTransaction(id, input, headers),
    onSuccess: () => {
      showToast('Изменения сохранены')

      return invalidate(id)
    },
  })
}

/** Защищено кодом на почту (`transaction.attachment`, `resourceId: id`). */
export function useUploadTransactionAttachment(id: string) {
  const invalidate = useInvalidateFinance()

  return useMutation({
    mutationFn: ({ file, headers }: { file: File; headers: HeadersInit }) =>
      uploadTransactionAttachment(id, file, headers),
    onSuccess: () => {
      showToast('Файл загружен')

      return invalidate(id)
    },
  })
}
