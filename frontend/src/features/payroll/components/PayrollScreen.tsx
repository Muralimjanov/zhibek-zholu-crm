'use client'

import { PageHeader } from '@/components/ui/PageHeader'
import { useSession } from '@/features/auth/useSession'
import NoAccess from '@/features/bookings/components/NoAccess'
import {
  canManagePayroll,
  canViewAllPayrollEntries,
  canViewOwnPayroll,
  canViewPayrollSection,
  canViewPayrollSettings,
} from '../access'
import PayrollEntriesSection from './PayrollEntriesSection'
import PayrollSettingsCard from './PayrollSettingsCard'

/**
 * Доступ живьём подтверждён для директора (настройки и весь список
 * начислений — только чтение) и тестового бухгалтера (полное управление).
 * Менеджер получает раздел «Моя зарплата» по описанию `GET /payroll/entries`
 * в OpenAPI («Sales managers see only their own entries»), отдельным живым
 * вызовом не проверялся. Начальник продаж раздел **не видит вовсе**: живая
 * проверка 18.09.2026 показала `403 AUTH_FORBIDDEN` на этот же запрос под
 * тестовым `test_hos` — см. `RELEASE_READINESS_REVIEW.md`,
 * `PAYROLL_API_EXAMPLES.md`.
 */
export function PayrollScreen() {
  const { user } = useSession()

  if (!user) {
    return null
  }

  if (!canViewPayrollSection(user.role)) {
    return (
      <NoAccess reason="Зарплата доступна директору (просмотр настроек и начислений), бухгалтеру (управление) и менеджеру (своя запись). Если доступ нужен по работе, обратитесь к руководителю." />
    )
  }

  const manage = canManagePayroll(user.role)
  const allEntries = canViewAllPayrollEntries(user.role)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Финансы"
        title="Зарплата"
        description={
          allEntries
            ? 'Настройки и начисления по компании.'
            : 'Ваши начисления зарплаты.'
        }
      />

      {manage || canViewPayrollSettings(user.role) ? (
        <PayrollSettingsCard canManage={manage} />
      ) : null}

      {allEntries || canViewOwnPayroll(user.role) ? (
        <PayrollEntriesSection
          canManage={manage}
          heading={allEntries ? 'Начисления' : 'Моя зарплата'}
        />
      ) : null}
    </div>
  )
}

export default PayrollScreen
