'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { showToast } from '@/components/ui/toast-store'
import { bookingKey } from '@/features/bookings/queries'
import { useSession } from '@/features/auth/useSession'
import type {
  ContractListQuery,
  ConvertBookingRequest,
  CreateContractRequest,
  UpdateContractRequest,
} from '@/types/contract'
import {
  createContract,
  convertBooking,
  fetchContract,
  fetchContracts,
  markDeposit,
  updateContract,
  uploadContractFile,
} from './api'
import { readContract, readContractList } from './parse'

export { useBuyerConsentQuery } from '@/features/bookings/queries'

/** Ключи привязаны к пользователю; кеш дополнительно чистится при выходе. */
const ANONYMOUS = 'anonymous'

export const contractsListKey = (userId: string, query: ContractListQuery) =>
  ['contracts', 'list', userId, query] as const

export const contractKey = (userId: string, id: string) =>
  ['contracts', 'item', userId, id] as const

function useCurrentUserId(): string | null {
  const { user } = useSession()

  return user?.id ?? null
}

export function useContractsQuery(query: ContractListQuery, enabled: boolean) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: contractsListKey(userId ?? ANONYMOUS, query),
    queryFn: async () =>
      readContractList(await fetchContracts(query), {
        limit: query.limit,
        offset: query.offset,
      }),
    enabled: enabled && userId !== null,
    retry: false,
  })
}

export function useContractQuery(id: string, enabled: boolean) {
  const userId = useCurrentUserId()

  return useQuery({
    queryKey: contractKey(userId ?? ANONYMOUS, id),
    queryFn: async () => readContract(await fetchContract(id)),
    enabled: enabled && userId !== null && id !== '',
    retry: false,
  })
}

/**
 * `onSuccess` у мутаций ниже ВОЗВРАЩАЕТ промис инвалидации (тот же паттерн,
 * что в `bookings`/`shifts`/`payroll`/`finance`) — мутация остаётся
 * `isPending`, пока список и карточка не обновятся по-настоящему, а не
 * только до ответа сервера.
 */
function useInvalidateContracts() {
  const queryClient = useQueryClient()
  const userId = useCurrentUserId() ?? ANONYMOUS

  return (id?: string) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['contracts', 'list', userId],
      }),
      id
        ? queryClient.invalidateQueries({ queryKey: contractKey(userId, id) })
        : Promise.resolve(),
    ])
}

function useInvalidateBookingsAfterConvert() {
  const queryClient = useQueryClient()
  const userId = useCurrentUserId() ?? ANONYMOUS

  return (bookingId: string) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['bookings', 'list', userId],
      }),
      queryClient.invalidateQueries({
        queryKey: bookingKey(userId, bookingId),
      }),
    ])
}

export function useCreateContract() {
  const invalidate = useInvalidateContracts()

  return useMutation({
    mutationFn: (input: CreateContractRequest) => createContract(input),
    onSuccess: () => {
      showToast('Договор создан')

      return invalidate()
    },
  })
}

export function useConvertBooking(bookingId: string) {
  const invalidateContracts = useInvalidateContracts()
  const invalidateBookings = useInvalidateBookingsAfterConvert()

  return useMutation({
    mutationFn: (input: ConvertBookingRequest) =>
      convertBooking(bookingId, input),
    onSuccess: () => {
      showToast('Бронь переведена в договор')

      return Promise.all([invalidateContracts(), invalidateBookings(bookingId)])
    },
  })
}

export function useUpdateContract(id: string) {
  const invalidate = useInvalidateContracts()

  return useMutation({
    mutationFn: (input: UpdateContractRequest) => updateContract(id, input),
    onSuccess: () => {
      showToast('Изменения сохранены')

      return invalidate(id)
    },
  })
}

/** Защищено кодом на почту (`contract.deposit`) — заголовки собирает вызывающий код. */
export function useMarkDeposit(id: string) {
  const invalidate = useInvalidateContracts()

  return useMutation({
    mutationFn: (headers: HeadersInit) => markDeposit(id, true, headers),
    onSuccess: () => {
      showToast('Взнос подтверждён')

      return invalidate(id)
    },
  })
}

/** Защищено кодом на почту (`contract.file`) — заголовки собирает вызывающий код. */
export function useUploadContractFile(id: string) {
  const invalidate = useInvalidateContracts()

  return useMutation({
    mutationFn: ({ file, headers }: { file: File; headers: HeadersInit }) =>
      uploadContractFile(id, file, headers),
    onSuccess: () => {
      showToast('Файл загружен, договор подписан')

      return invalidate(id)
    },
  })
}
