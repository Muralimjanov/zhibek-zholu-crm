'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { showToast } from '@/components/ui/toast-store'
import { describeApiError } from '@/features/auth/error-messages'
import { bumpAvatarVersion, updateSessionUser } from '@/features/auth/session'
import type { User } from '@/types/auth'
import {
  AVATAR_MIME_TYPES,
  deleteAvatar,
  uploadAvatar,
  validateAvatarFile,
} from '../api'
import UserAvatar from './UserAvatar'

type Pending = null | 'upload' | 'delete'

const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'

export function AvatarManager({
  user,
  version,
  showPreview = true,
}: {
  user: User
  version: number
  /** `false`, если фото уже показано выше (identity card) — не дублировать. */
  showPreview?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    // Сбрасываем input сразу, иначе повторный выбор того же файла не сработает.
    event.target.value = ''

    if (!file) {
      return
    }

    setError(null)

    const validationError = validateAvatarFile(file)

    if (validationError) {
      setError(validationError)

      return
    }

    setPending('upload')

    try {
      // Локальный preview не показываем: картинка меняется только после
      // подтверждения сервера.
      const updated = await uploadAvatar(file)

      updateSessionUser(updated)
      bumpAvatarVersion()
      showToast('Фото обновлено')
    } catch (uploadError) {
      setError(describeApiError(uploadError))
    } finally {
      setPending(null)
    }
  }

  const handleDelete = async () => {
    setError(null)
    setPending('delete')

    try {
      await deleteAvatar()
      updateSessionUser({ ...user, avatarUrl: null })
      bumpAvatarVersion()
      showToast('Фото удалено')
    } catch (deleteError) {
      setError(describeApiError(deleteError))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      {showPreview ? (
        <UserAvatar user={user} version={version} size="lg" />
      ) : null}

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => {
              inputRef.current?.click()
            }}
            className={buttonClass}
          >
            {pending === 'upload'
              ? 'Загружаем…'
              : user.avatarUrl
                ? 'Заменить фото'
                : 'Загрузить фото'}
          </button>

          {user.avatarUrl ? (
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void handleDelete()}
              className={buttonClass}
            >
              {pending === 'delete' ? 'Удаляем…' : 'Удалить фото'}
            </button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_MIME_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void handleChange(event)}
        />

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          JPEG, PNG или WebP, не больше 10 МБ.
        </p>

        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export default AvatarManager
