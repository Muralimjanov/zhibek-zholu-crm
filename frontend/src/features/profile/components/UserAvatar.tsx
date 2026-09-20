'use client'

import { getInitials } from '@/lib/utils/initials'
import type { User } from '@/types/auth'
import { useAvatarObjectUrl } from '../useAvatarObjectUrl'

const SIZE_CLASSES = {
  sm: 'size-9 text-xs',
  lg: 'size-24 text-2xl',
} as const

interface UserAvatarProps {
  user: User
  version: number
  size?: keyof typeof SIZE_CLASSES
}

/**
 * Инициалы без фото и без сетевого запроса — для списков (`UsersList`), где
 * N параллельных авторизованных загрузок фото (и вероятные 404 для тех, у
 * кого фото нет) неэффективны. Настоящее фото остаётся в профиле/topbar.
 */
export function UserInitialsAvatar({
  fullName,
  size = 'sm',
}: {
  fullName: string
  size?: keyof typeof SIZE_CLASSES
}) {
  return (
    <span
      aria-hidden="true"
      className={`${SIZE_CLASSES[size]} shrink-0 overflow-hidden rounded-full flex items-center justify-center bg-brand-100 font-medium text-brand-800 dark:bg-brand-950 dark:text-brand-200`}
    >
      {getInitials(fullName)}
    </span>
  )
}

export function UserAvatar({ user, version, size = 'sm' }: UserAvatarProps) {
  const objectUrl = useAvatarObjectUrl(user.id, user.avatarUrl, version)
  const className = `${SIZE_CLASSES[size]} shrink-0 overflow-hidden rounded-full`

  if (objectUrl) {
    return (
      // Картинка приходит авторизованным запросом как object URL:
      // next/image не может добавить заголовок Authorization.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={objectUrl}
        alt=""
        className={`${className} object-cover`}
        draggable={false}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`${className} flex items-center justify-center bg-brand-100 font-medium text-brand-800 dark:bg-brand-950 dark:text-brand-200`}
    >
      {getInitials(user.fullName)}
    </span>
  )
}

export default UserAvatar
