import type { UserRole } from '@/types/auth'

export type ReportType = 'financial' | 'sales'

export function canViewDashboard(role: UserRole | null | undefined): boolean {
  return role === 'director' || role === 'investor'
}

export function canViewSalesAnalytics(
  role: UserRole | null | undefined,
): boolean {
  return role === 'director' || role === 'head_of_sales'
}

export function allowedReportTypes(
  role: UserRole | null | undefined,
): ReportType[] {
  if (role === 'director' || role === 'investor') return ['financial', 'sales']
  if (role === 'accountant') return ['financial']
  if (role === 'head_of_sales') return ['sales']
  return []
}
