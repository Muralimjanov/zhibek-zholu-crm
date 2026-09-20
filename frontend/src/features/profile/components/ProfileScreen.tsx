'use client'

import ThemeSelector from '@/components/theme/ThemeSelector'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import { formatRole } from '@/features/auth/labels'
import { useSession } from '@/features/auth/useSession'
import AvatarManager from './AvatarManager'
import ChangeEmailFlow from './ChangeEmailFlow'
import ProfileForm from './ProfileForm'
import UserAvatar from './UserAvatar'

export function ProfileScreen() {
  const { user, avatarVersion } = useSession()

  if (!user) {
    return null
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Настройки"
        title="Профиль"
        description="Личные данные, фото и почта для входа."
      />

      {/* Identity card: сводка всех статичных данных аккаунта одним блоком —
          ниже идут только интерактивные секции, без повторного показа тех же
          значений (фото/логин/роль/почта). */}
      <section className={SECTION_CLASS}>
        <div className="flex flex-wrap items-center gap-4">
          <UserAvatar user={user} version={avatarVersion} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {user.fullName}
            </p>
            <p className="text-sm text-muted">{formatRole(user.role)}</p>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Логин</dt>
            <dd className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-50">
              {user.username}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Почта</dt>
            <dd className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-50">
              {user.email ?? '—'}
              {user.email ? (
                <span
                  className={
                    user.emailVerified
                      ? 'ml-2 text-xs text-muted'
                      : 'ml-2 text-xs text-amber-700 dark:text-amber-400'
                  }
                >
                  {user.emailVerified ? 'подтверждена' : 'не подтверждена'}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs text-muted">
          Логин и роль меняет руководитель — самостоятельно их изменить нельзя.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>Оформление</h2>
        <div className="mt-4">
          <ThemeSelector />
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>Личные данные</h2>
        <div className="mt-4">
          <ProfileForm key={user.id} user={user} />
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>Фотография</h2>
        <div className="mt-4">
          <AvatarManager
            user={user}
            version={avatarVersion}
            showPreview={false}
          />
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>Смена почты</h2>
        <p className="mt-2 text-xs text-muted">
          На этот адрес приходит код входа. Меняется отдельно — с подтверждением
          и текущего, и нового адреса.
        </p>
        <div className="mt-4">
          <ChangeEmailFlow key={user.id} user={user} />
        </div>
      </section>
    </div>
  )
}

export default ProfileScreen
