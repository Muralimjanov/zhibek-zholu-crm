'use client'

import { PageHeader } from '@/components/ui/PageHeader'
import { useSession } from '@/features/auth/useSession'
import { canConfirmActions, canViewUsers } from '../access'
import AccessDenied from './AccessDenied'
import CreateUserForm from './CreateUserForm'
import PendingActions from './PendingActions'
import UsersList from './UsersList'

export function UsersScreen() {
  const { user } = useSession()

  if (!user) {
    return null
  }

  if (!canViewUsers(user.role)) {
    return <AccessDenied />
  }

  const isDirector = canConfirmActions(user.role)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Администрирование"
        title={isDirector ? 'Пользователи' : 'Моя команда'}
        description={
          isDirector
            ? 'Все сотрудники компании и запросы на создание аккаунтов.'
            : 'Сотрудники вашей команды.'
        }
      />

      {isDirector ? <PendingActions currentUser={user} /> : null}
      <UsersList heading={isDirector ? 'Все пользователи' : 'Моя команда'} />
      <CreateUserForm currentRole={user.role} />
    </div>
  )
}

export default UsersScreen
