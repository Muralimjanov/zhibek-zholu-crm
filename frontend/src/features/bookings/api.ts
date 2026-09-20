import { authorizedRequest } from '@/features/auth/session'
import type {
  BookingListQuery,
  CreateBookingRequest,
  UpdateBookingRequest,
} from '@/types/booking'

function buildListQuery(query: BookingListQuery): string {
  const params = new URLSearchParams()

  if (query.status) {
    params.set('status', query.status)
  }

  if (query.managerId) {
    params.set('managerId', query.managerId)
  }

  // Точный поиск: сервер ищет по слепому индексу, локальной фильтрации нет.
  if (query.passportNumber) {
    params.set('passportNumber', query.passportNumber)
  }

  if (query.phone) {
    params.set('phone', query.phone)
  }

  params.set('limit', String(query.limit))
  params.set('offset', String(query.offset))

  return params.toString()
}

export function fetchBookings(query: BookingListQuery) {
  return authorizedRequest<unknown>(`/bookings?${buildListQuery(query)}`)
}

/** Просмотр карточки сервер пишет в журнал — лишний раз не дёргаем. */
export function fetchBooking(id: string) {
  return authorizedRequest<unknown>(`/bookings/${encodeURIComponent(id)}`)
}

export function createBooking(input: CreateBookingRequest) {
  return authorizedRequest<unknown>('/bookings', {
    method: 'POST',
    json: input,
  })
}

export function updateBooking(id: string, input: UpdateBookingRequest) {
  return authorizedRequest<unknown>(`/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: input,
  })
}
