'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { showToast } from '@/components/ui/toast-store'
import { useSession } from '@/features/auth/useSession'
import type {
  CreateDayOffRequest,
  DayOffListQuery,
  ShiftListQuery,
} from '@/types/shift'
import {
  closeShift,
  createDayOff,
  fetchCurrentShift,
  fetchDayOffs,
  fetchShifts,
  openShift,
} from './api'
import { readCurrentShift, readDayOffList, readShiftList } from './parse'

/** Ключи привязаны к пользователю; кеш дополнительно чистится при выходе. */
const ANONYMOUS = 'anonymous'

export const currentShiftKey = (userId: string) =>
  ['shifts', 'current', userId] as const

export const shiftsListKey = (userId: string, query: ShiftListQuery) =>
  ['shifts', 'list', userId, query] as const

export const dayOffsListKey = (userId: string, query: DayOffListQuery) =>
  ['dayOffs', 'list', userId, query] as const

function useCurrentUserId(): string | null {
  const { user } = useSession()

  return user?.id ?? null
}

export function useCurrentShiftQuery(enabled: boolean) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: currentShiftKey(userId ?? ANONYMOUS),
    queryFn: async () => readCurrentShift(await fetchCurrentShift()),
    enabled: enabled && userId !== null,
    retry: false,
  })
}

export function useShiftsQuery(query: ShiftListQuery, enabled: boolean) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: shiftsListKey(userId ?? ANONYMOUS, query),
    queryFn: async () =>
      readShiftList(await fetchShifts(query), {
        limit: query.limit,
        offset: query.offset,
      }),
    enabled: enabled && userId !== null,
    retry: false,
  })
}

export function useDayOffsQuery(query: DayOffListQuery, enabled: boolean) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: dayOffsListKey(userId ?? ANONYMOUS, query),
    queryFn: async () =>
      readDayOffList(await fetchDayOffs(query), {
        limit: query.limit,
        offset: query.offset,
      }),
    enabled: enabled && userId !== null,
    retry: false,
  })
}

/**
 * `onSuccess` здесь ВОЗВРАЩАЕТ промис инвалидации, а не просто запускает
 * её: TanStack Query держит мутацию в `isPending` до тех пор, пока промис
 * из `onSuccess` не завершится. Так кнопка «Открыть/закрыть смену» остаётся
 * задизейбленной весь промежуток между успешным ответом сервера и
 * реальным обновлением `GET /shifts/current` — иначе в этом окне повторный
 * клик отправил бы второй `POST` на уже открытую/закрытую смену.
 */
function useInvalidateShifts() {
  const queryClient = useQueryClient()
  const userId = useCurrentUserId() ?? ANONYMOUS

  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['shifts', 'current', userId],
      }),
      queryClient.invalidateQueries({ queryKey: ['shifts', 'list', userId] }),
    ])
}

export function useOpenShift() {
  const invalidate = useInvalidateShifts()

  return useMutation({
    mutationFn: () => openShift(),
    onSuccess: () => {
      showToast('Смена открыта')

      return invalidate()
    },
  })
}

export function useCloseShift() {
  const invalidate = useInvalidateShifts()

  return useMutation({
    mutationFn: () => closeShift(),
    onSuccess: () => {
      showToast('Смена закрыта')

      return invalidate()
    },
  })
}

/**
 * Та же логика, что у `useInvalidateShifts`: возвращённый из `onSuccess`
 * промис держит форму согласования выходного в состоянии отправки, пока
 * список выходных не обновится по-настоящему.
 */
export function useCreateDayOff() {
  const queryClient = useQueryClient()
  const userId = useCurrentUserId() ?? ANONYMOUS

  return useMutation({
    mutationFn: (input: CreateDayOffRequest) => createDayOff(input),
    onSuccess: () => {
      showToast('Выходной согласован')

      return queryClient.invalidateQueries({
        queryKey: ['dayOffs', 'list', userId],
      })
    },
  })
}
