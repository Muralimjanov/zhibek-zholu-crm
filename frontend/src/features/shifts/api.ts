import { authorizedRequest } from '@/features/auth/session'
import type {
  CreateDayOffRequest,
  DayOffListQuery,
  ShiftListQuery,
} from '@/types/shift'

function buildQuery(params: object): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value))
    }
  }

  return search.toString()
}

/** Пустое тело при отсутствии смены — см. `readCurrentShift`. */
export function fetchCurrentShift() {
  return authorizedRequest<unknown>('/shifts/current')
}

export function openShift() {
  return authorizedRequest<unknown>('/shifts/open', { method: 'POST' })
}

/** Для начальника продаж/бухгалтера сервер сам создаёт ежедневный отчёт (`reportGenerated`). */
export function closeShift() {
  return authorizedRequest<unknown>('/shifts/close', { method: 'POST' })
}

export function fetchShifts(query: ShiftListQuery) {
  return authorizedRequest<unknown>(`/shifts?${buildQuery(query)}`)
}

export function fetchDayOffs(query: DayOffListQuery) {
  return authorizedRequest<unknown>(`/day-offs?${buildQuery(query)}`)
}

export function createDayOff(input: CreateDayOffRequest) {
  return authorizedRequest<unknown>('/day-offs', {
    method: 'POST',
    json: input,
  })
}
