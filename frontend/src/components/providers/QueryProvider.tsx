'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { onSessionReset } from '@/features/auth/session-store'

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  /**
   * QueryClient живёт столько же, сколько вкладка, а в нём лежат приватные
   * данные — например список сотрудников по роли. При сбросе сессии кеш нужно
   * очистить синхронно, иначе следующий вошедший в этой же вкладке увидит
   * чужие данные до того, как придёт ответ для его роли.
   *
   * Сначала отменяем активные запросы: иначе их запоздавшие ответы положили бы
   * приватные данные обратно в уже очищенный кеш.
   */
  useEffect(
    () =>
      onSessionReset(() => {
        void queryClient.cancelQueries()
        queryClient.clear()
      }),
    [queryClient],
  )

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

export default QueryProvider
