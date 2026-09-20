import type { ReportType } from './access.ts'
export interface ReportFilters {
  type?: ReportType
  from?: string
  to?: string
  limit: number
  offset: number
}
export function reportSearch(filters: ReportFilters): string {
  const p = new URLSearchParams()
  if (filters.type) p.set('type', filters.type)
  if (filters.from) p.set('from', filters.from)
  if (filters.to) p.set('to', filters.to)
  p.set('limit', String(filters.limit))
  p.set('offset', String(filters.offset))
  return p.toString()
}
