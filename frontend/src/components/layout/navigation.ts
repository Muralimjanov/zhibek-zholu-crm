import type { Icon } from '@phosphor-icons/react'
import {
  CalculatorIcon,
  CalendarBlankIcon,
  ChartLineUpIcon,
  ClockIcon,
  FileTextIcon,
  HouseIcon,
  UserCircleIcon,
  UsersThreeIcon,
  WalletIcon,
} from '@phosphor-icons/react/dist/ssr'
import { canViewBookings } from '@/features/bookings/access'
import { canViewContracts } from '@/features/contracts/access'
import { canViewFinanceSection } from '@/features/finance/access'
import { canViewPayrollSection } from '@/features/payroll/access'
import { canViewShiftsSection } from '@/features/shifts/access'
import { allowedReportTypes } from '@/features/reports/access'
import { usersNavLabel } from '@/features/users/access'
import type { UserRole } from '@/types/auth'

export interface NavItem {
  href: string
  label: string
  icon: Icon
}

export interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

/**
 * Группы IA дизайн-контракта (CLAUDE_CRM_PREMIUM_REDESIGN_TASK.md, п.4).
 * Группа рендерится в sidebar только когда в ней есть хотя бы один пункт —
 * пустых заголовков групп в короткой навигации нет.
 *
 * Иконки — из Phosphor (`/dist/ssr`, без `'use client'`, чтобы
 * `navigation.ts` остался обычным модулем), не эмодзи: последовательный
 * набор с одной толщиной обводки.
 */
export function buildNavGroups(role: UserRole | null): NavGroup[] {
  const workspace: NavItem[] = [
    { href: '/dashboard', label: 'Главная', icon: HouseIcon },
  ]
  const operations: NavItem[] = []
  const finance: NavItem[] = []
  const analytics: NavItem[] = []
  const admin: NavItem[] = []

  if (canViewBookings(role)) {
    operations.push({
      href: '/bookings',
      label: 'Бронирования',
      icon: CalendarBlankIcon,
    })
  }

  if (canViewContracts(role)) {
    operations.push({
      href: '/contracts',
      label: 'Договоры',
      icon: FileTextIcon,
    })
  }

  if (canViewShiftsSection(role)) {
    operations.push({ href: '/shifts', label: 'Смены', icon: ClockIcon })
  }

  if (canViewPayrollSection(role)) {
    finance.push({ href: '/payroll', label: 'Зарплата', icon: WalletIcon })
  }

  if (canViewFinanceSection(role)) {
    finance.push({
      href: '/finance',
      label: 'Бухгалтерия',
      icon: CalculatorIcon,
    })
  }

  if (allowedReportTypes(role).length > 0) {
    analytics.push({ href: '/reports', label: 'Отчёты', icon: ChartLineUpIcon })
  }

  const usersLabel = usersNavLabel(role)

  if (usersLabel) {
    admin.push({ href: '/users', label: usersLabel, icon: UsersThreeIcon })
  }

  workspace.push({ href: '/profile', label: 'Профиль', icon: UserCircleIcon })

  return [
    { key: 'workspace', label: 'Рабочее пространство', items: workspace },
    { key: 'operations', label: 'Операции', items: operations },
    { key: 'finance', label: 'Финансы', items: finance },
    { key: 'analytics', label: 'Аналитика', items: analytics },
    { key: 'admin', label: 'Администрирование', items: admin },
  ].filter((group) => group.items.length > 0)
}

/** Плоский список для мест, которым не нужна группировка (fallback-ссылки, поиск активного пункта). */
export function buildNavItems(role: UserRole | null): NavItem[] {
  return buildNavGroups(role).flatMap((group) => group.items)
}

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

const FALLBACK_TITLES: Record<string, string> = {
  '/users': 'Пользователи',
  '/bookings': 'Бронирования',
  '/contracts': 'Договоры',
  '/shifts': 'Смены',
  '/payroll': 'Зарплата',
  '/finance': 'Бухгалтерия',
  '/reports': 'Отчёты',
}

export function resolvePageTitle(pathname: string, items: NavItem[]): string {
  const match = items.find((item) => isNavItemActive(pathname, item.href))

  if (match) {
    return match.label
  }

  const fallback = Object.entries(FALLBACK_TITLES).find(([href]) =>
    isNavItemActive(pathname, href),
  )

  return fallback?.[1] ?? 'CRM'
}
