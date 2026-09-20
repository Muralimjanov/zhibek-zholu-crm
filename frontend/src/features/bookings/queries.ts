'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { showToast } from '@/components/ui/toast-store'
import { useSession } from '@/features/auth/useSession'
import { requestLegalDocument } from '@/features/legal/api'
import type {
  BookingListQuery,
  CreateBookingRequest,
  UpdateBookingRequest,
} from '@/types/booking'
import {
  createBooking,
  fetchBooking,
  fetchBookings,
  updateBooking,
} from './api'
import { readBooking, readBookingList } from './parse'

/** Ключи привязаны к пользователю; кеш дополнительно чистится при выходе. */
const ANONYMOUS = 'anonymous'

export const bookingsListKey = (userId: string, query: BookingListQuery) =>
  ['bookings', 'list', userId, query] as const

export const bookingKey = (userId: string, id: string) =>
  ['bookings', 'item', userId, id] as const

function useCurrentUserId(): string | null {
  const { user } = useSession()

  return user?.id ?? null
}

export function useBookingsQuery(query: BookingListQuery, enabled: boolean) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: bookingsListKey(userId ?? ANONYMOUS, query),
    queryFn: async () =>
      readBookingList(await fetchBookings(query), {
        limit: query.limit,
        offset: query.offset,
      }),
    enabled: enabled && userId !== null,
    retry: false,
  })
}

export function useBookingQuery(id: string, enabled: boolean) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: bookingKey(userId ?? ANONYMOUS, id),
    queryFn: async () => readBooking(await fetchBooking(id)),
    enabled: enabled && userId !== null && id !== '',
    retry: false,
  })
}

/**
 * `onSuccess` у мутаций ниже ВОЗВРАЩАЕТ этот промис (как в `shifts`/
 * `payroll`/`finance`) — TanStack Query держит мутацию в `isPending`, пока
 * список и карточка не обновятся по-настоящему, а не только до ответа
 * сервера. Раньше промис отбрасывался через `void`: кнопка успевала снова
 * стать активной до того, как карточка показала новые данные.
 */
function useInvalidateBookings() {
  const queryClient = useQueryClient()
  const userId = useCurrentUserId() ?? ANONYMOUS

  return (id?: string) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['bookings', 'list', userId],
      }),
      id
        ? queryClient.invalidateQueries({ queryKey: bookingKey(userId, id) })
        : Promise.resolve(),
    ])
}

/** Форма согласия покупателя; версию берём из ответа, а не из кода. */
export const BUYER_CONSENT_TYPE = 'buyer_personal_data_consent'

export function useBuyerConsentQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['legal', 'document', BUYER_CONSENT_TYPE],
    queryFn: () => requestLegalDocument(BUYER_CONSENT_TYPE),
    enabled,
    retry: false,
  })
}

export function useCreateBooking() {
  const invalidate = useInvalidateBookings()

  return useMutation({
    mutationFn: (input: CreateBookingRequest) => createBooking(input),
    onSuccess: () => {
      showToast('Бронь создана')

      return invalidate()
    },
  })
}

export function useUpdateBooking(id: string) {
  const invalidate = useInvalidateBookings()

  return useMutation({
    mutationFn: (input: UpdateBookingRequest) => updateBooking(id, input),
    onSuccess: () => {
      showToast('Изменения сохранены')

      return invalidate(id)
    },
  })
}
