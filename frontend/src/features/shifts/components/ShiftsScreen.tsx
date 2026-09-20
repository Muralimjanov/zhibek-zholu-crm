'use client'

import { PageHeader } from '@/components/ui/PageHeader'
import { useSession } from '@/features/auth/useSession'
import NoAccess from '@/features/bookings/components/NoAccess'
import {
  canHaveOwnShift,
  canViewDayOffsSection,
  canViewShiftsSection,
  canViewTeamShifts,
} from '../access'
import CurrentShiftCard from './CurrentShiftCard'
import DayOffsSection from './DayOffsSection'
import ShiftsHistorySection from './ShiftsHistorySection'

export function ShiftsScreen() {
  const { user } = useSession()

  if (!user) {
    return null
  }

  if (!canViewShiftsSection(user.role)) {
    return (
      <NoAccess reason="Смены и выходные доступны директору, начальнику отдела продаж, менеджерам и бухгалтеру. Если доступ нужен по работе, обратитесь к руководителю." />
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Операции"
        title="Смены"
        description="Своя смена, история и выходные."
      />

      {canHaveOwnShift(user.role) ? <CurrentShiftCard /> : null}

      <ShiftsHistorySection showEmployee={canViewTeamShifts(user.role)} />

      {canViewDayOffsSection(user.role) ? <DayOffsSection /> : null}
    </div>
  )
}

export default ShiftsScreen
