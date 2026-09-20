'use client'

import Link from 'next/link'
import { buildNavItems } from '@/components/layout/navigation'
import { PageHeader } from '@/components/ui/PageHeader'
import { SECTION_CLASS } from '@/features/bookings/components/section'
import { useSession } from '@/features/auth/useSession'
import { canViewDashboard } from '../access'
import AccountantHome from './AccountantHome'
import CorporateDashboard from './CorporateDashboard'
import HeadOfSalesHome from './HeadOfSalesHome'
import SalesManagerHome from './SalesManagerHome'

/**
 * Роль-зависимая главная (дизайн-контракт, п.6). Директор и инвестор —
 * единственные роли с `GET /dashboard` (`canViewDashboard`), у них
 * `CorporateDashboard`. Остальные известные роли получают рабочую главную,
 * собранную только из их собственных разрешённых запросов. Неизвестная роль
 * (или её отсутствие в ролевых главных ниже) — честный fallback со ссылками
 * на доступные разделы, а не пустой экран.
 */
export default function DashboardScreen() {
  const { user } = useSession()

  if (!user) {
    return null
  }

  if (canViewDashboard(user.role)) {
    return <CorporateDashboard role={user.role} />
  }

  if (user.role === 'head_of_sales') {
    return <HeadOfSalesHome role={user.role} />
  }

  if (user.role === 'sales_manager') {
    return <SalesManagerHome />
  }

  if (user.role === 'accountant') {
    return <AccountantHome />
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={`Здравствуйте, ${user.fullName}`}
        description="Доступные разделы:"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {buildNavItems(user.role)
          .filter((x) => x.href !== '/dashboard')
          .map((x) => (
            <Link
              key={x.href}
              href={x.href}
              className={`${SECTION_CLASS} text-brand-700 underline dark:text-brand-300`}
            >
              {x.label}
            </Link>
          ))}
      </div>
    </div>
  )
}
