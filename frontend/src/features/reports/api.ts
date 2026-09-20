import { authorizedRequest } from '@/features/auth/session'
import { reportSearch, type ReportFilters } from './filters'
export const fetchDashboard = () => authorizedRequest<unknown>('/dashboard')
export const fetchSalesAnalytics = () =>
  authorizedRequest<unknown>('/analytics/sales')
export const fetchReports = (filters: ReportFilters) =>
  authorizedRequest<unknown>(`/daily-reports?${reportSearch(filters)}`)
export const fetchReport = (id: string) =>
  authorizedRequest<unknown>(`/daily-reports/${encodeURIComponent(id)}`)
