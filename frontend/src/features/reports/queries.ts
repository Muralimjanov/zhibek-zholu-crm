'use client'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/features/auth/useSession'
import {
  fetchDashboard,
  fetchReport,
  fetchReports,
  fetchSalesAnalytics,
} from './api'
import type { ReportFilters } from './filters'
import {
  readDailyReport,
  readDashboard,
  readReportList,
  readSalesAnalytics,
} from './parse'
export function useDashboardQuery(enabled: boolean) {
  const { user } = useSession()
  return useQuery({
    queryKey: ['reports', user?.id, 'dashboard'],
    queryFn: async () => readDashboard(await fetchDashboard()),
    enabled: enabled && !!user,
    retry: false,
  })
}
export function useSalesAnalyticsQuery(enabled: boolean) {
  const { user } = useSession()
  return useQuery({
    queryKey: ['reports', user?.id, 'sales-analytics'],
    queryFn: async () => readSalesAnalytics(await fetchSalesAnalytics()),
    enabled: enabled && !!user,
    retry: false,
  })
}
export function useReportsQuery(filters: ReportFilters, enabled: boolean) {
  const { user } = useSession()
  return useQuery({
    queryKey: ['reports', user?.id, 'list', filters],
    queryFn: async () => readReportList(await fetchReports(filters)),
    enabled: enabled && !!user,
    retry: false,
  })
}
export function useReportQuery(id: string, enabled: boolean) {
  const { user } = useSession()
  return useQuery({
    queryKey: ['reports', user?.id, 'item', id],
    queryFn: async () => readDailyReport(await fetchReport(id)),
    enabled: enabled && !!user && !!id,
    retry: false,
  })
}
