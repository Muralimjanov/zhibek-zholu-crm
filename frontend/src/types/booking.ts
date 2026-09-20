/**
 * Типы бронирований.
 *
 * Тела запросов взяты из опубликованной схемы staging и backend-инструкции
 * `API_TESTING.md` (раздел 5). Тела ответов `GET /bookings` и
 * `GET /bookings/{id}` в OpenAPI не описаны вовсе; форма ниже подтверждена
 * фактическими ответами staging под `demo_director`, зафиксированными в
 * `BOOKINGS_API_EXAMPLES.md`. Разбор по-прежнему вынесен в единственный
 * модуль `src/features/bookings/parse.ts`.
 */

/** `status` в PATCH ограничен двумя значениями; `converted` ставит конвертация. */
export type EditableBookingStatus = 'active' | 'cancelled'

/** Значения фильтра списка из описания `GET /bookings`. */
export type BookingStatusFilter = 'active' | 'converted' | 'cancelled'

export interface CreateBookingRequest {
  fullName: string
  passportNumber: string
  phone: string
  email?: string
  desiredAreaSqm: string
  buyerConsentConfirmed: true
  buyerConsentVersion: string
  /** Обязателен для директора; у менеджера сервер подставляет сам. */
  managerId?: string
}

export interface UpdateBookingRequest {
  fullName?: string
  passportNumber?: string
  phone?: string
  /** `null` очищает почту. */
  email?: string | null
  desiredAreaSqm?: string
  status?: EditableBookingStatus
  managerId?: string
}

/**
 * Модель, которую строит `parse.ts` из фактического ответа сервера.
 * Сервер не возвращает имя менеджера — только `managerId`; интерфейс
 * показывает то, что реально пришло, а не выдуманное поле.
 */
export interface Booking {
  id: string
  fullName: string | null
  /** В списке маскируется сервером, в карточке приходит полностью. */
  passportNumber: string | null
  phone: string | null
  email: string | null
  desiredAreaSqm: string | null
  status: string | null
  managerId: string | null
  /** Не `null`, только пока бронь не переведена в договор. */
  contractId: string | null
  buyerConsentVersion: string | null
  buyerConsentConfirmedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface BookingList {
  items: Booking[]
  total: number
  limit: number
  offset: number
}

export interface BookingListQuery {
  status?: BookingStatusFilter
  managerId?: string
  passportNumber?: string
  phone?: string
  limit: number
  offset: number
}
