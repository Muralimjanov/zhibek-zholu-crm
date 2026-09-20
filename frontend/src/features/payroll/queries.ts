'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { showToast } from '@/components/ui/toast-store'
import { useSession } from '@/features/auth/useSession'
import type {
  CorrectPayrollEntryRequest,
  GeneratePayrollEntriesRequest,
  PayrollEntryListQuery,
  UpdatePayrollSettingsRequest,
} from '@/types/payroll'
import {
  confirmPayrollEntry,
  correctPayrollEntry,
  fetchPayrollEntries,
  fetchPayrollEntry,
  fetchPayrollSettings,
  generatePayrollEntries,
  updatePayrollSettings,
} from './api'
import {
  readPayrollEntryList,
  readPayrollEntryOrThrow,
  readPayrollSettings,
} from './parse'

/** Ключи привязаны к пользователю — как в `shifts`/`contracts`. */
const ANONYMOUS = 'anonymous'

export const payrollSettingsKey = (userId: string) =>
  ['payroll', 'settings', userId] as const

export const payrollEntriesListKey = (
  userId: string,
  query: PayrollEntryListQuery,
) => ['payroll', 'entries', 'list', userId, query] as const

export const payrollEntryKey = (userId: string, id: string) =>
  ['payroll', 'entries', 'item', userId, id] as const

function useCurrentUserId(): string | null {
  const { user } = useSession()

  return user?.id ?? null
}

export function usePayrollSettingsQuery(enabled: boolean) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: payrollSettingsKey(userId ?? ANONYMOUS),
    queryFn: async () => readPayrollSettings(await fetchPayrollSettings()),
    enabled: enabled && userId !== null,
    retry: false,
  })
}

export function usePayrollEntriesQuery(
  query: PayrollEntryListQuery,
  enabled: boolean,
) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: payrollEntriesListKey(userId ?? ANONYMOUS, query),
    queryFn: async () => readPayrollEntryList(await fetchPayrollEntries(query)),
    enabled: enabled && userId !== null,
    retry: false,
  })
}

export function usePayrollEntryQuery(id: string, enabled: boolean) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: payrollEntryKey(userId ?? ANONYMOUS, id),
    queryFn: async () => readPayrollEntryOrThrow(await fetchPayrollEntry(id)),
    enabled: enabled && userId !== null && id !== '',
    retry: false,
  })
}

/**
 * `onSuccess` ВОЗВРАЩАЕТ промис инвалидации — как в исправлении
 * `shifts/queries.ts` — так мутация остаётся `isPending` (кнопки
 * задизейблены) до реального обновления кеша, а не только до ответа
 * сервера. Иначе повторный клик в этом окне мог бы отправить второй запрос
 * поверх ещё не обновившихся данных.
 */
function useInvalidatePayrollEntries() {
  const queryClient = useQueryClient()
  const userId = useCurrentUserId() ?? ANONYMOUS

  return (id?: string) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['payroll', 'entries', 'list', userId],
      }),
      id
        ? queryClient.invalidateQueries({
            queryKey: payrollEntryKey(userId, id),
          })
        : Promise.resolve(),
    ])
}

/** Защищено кодом на почту (`payroll.settings.update`) — заголовки собирает вызывающий код. */
export function useUpdatePayrollSettings() {
  const queryClient = useQueryClient()
  const userId = useCurrentUserId() ?? ANONYMOUS

  return useMutation({
    mutationFn: ({
      input,
      headers,
    }: {
      input: UpdatePayrollSettingsRequest
      headers: HeadersInit
    }) => updatePayrollSettings(input, headers),
    onSuccess: () => {
      showToast('Настройки сохранены')

      return queryClient.invalidateQueries({
        queryKey: payrollSettingsKey(userId),
      })
    },
  })
}

/** Код не нужен (подтверждено OpenAPI). Не запускать автоматически — только по явному клику с подтверждением периода. */
export function useGeneratePayrollEntries() {
  const invalidate = useInvalidatePayrollEntries()

  return useMutation({
    mutationFn: (input: GeneratePayrollEntriesRequest) =>
      generatePayrollEntries(input),
    onSuccess: () => {
      showToast('Начисления сформированы')

      return invalidate()
    },
  })
}

/** Код не нужен (подтверждено OpenAPI). Сервер отклонит 409, если запись уже `confirmed`. */
export function useCorrectPayrollEntry(id: string) {
  const invalidate = useInvalidatePayrollEntries()

  return useMutation({
    mutationFn: (input: CorrectPayrollEntryRequest) =>
      correctPayrollEntry(id, input),
    onSuccess: () => {
      showToast('Начисление скорректировано')

      return invalidate(id)
    },
  })
}

/** Защищено кодом на почту (`payroll.confirm`, `resourceId: id`) — заголовки собирает вызывающий код. */
export function useConfirmPayrollEntry(id: string) {
  const invalidate = useInvalidatePayrollEntries()

  return useMutation({
    mutationFn: (headers: HeadersInit) => confirmPayrollEntry(id, headers),
    onSuccess: () => {
      showToast('Начисление подтверждено')

      return invalidate(id)
    },
  })
}
