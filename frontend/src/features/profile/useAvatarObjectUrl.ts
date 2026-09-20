'use client'

import { useEffect, useState } from 'react'
import { fetchAvatarBlob } from './api'
import { releaseObjectUrl, trackObjectUrl } from './object-urls'

interface LoadedAvatar {
  key: string
  url: string
}

/**
 * Грузит приватный аватар авторизованным запросом и отдаёт object URL.
 * URL освобождается при замене фото, смене пользователя и размонтировании;
 * пока грузится новая картинка, старая не показывается.
 *
 * `version` нужен потому, что `avatarUrl` при замене фотографии не меняется.
 */
export function useAvatarObjectUrl(
  userId: string | null,
  avatarUrl: string | null,
  version: number,
): string | null {
  const key = userId && avatarUrl ? `${userId}|${avatarUrl}|${version}` : null
  const [loaded, setLoaded] = useState<LoadedAvatar | null>(null)

  useEffect(() => {
    if (!key || !userId) {
      return
    }

    let cancelled = false
    let created: string | null = null

    fetchAvatarBlob(userId)
      .then((blob) => {
        if (cancelled) {
          return
        }

        created = URL.createObjectURL(blob)
        trackObjectUrl(created)
        setLoaded({ key, url: created })
      })
      .catch(() => {
        // Ошибку показывать здесь не нужно: остаются инициалы.
      })

    return () => {
      cancelled = true

      if (created) {
        releaseObjectUrl(created)
      }
    }
  }, [key, userId])

  // Устаревший URL уже освобождён, поэтому наружу отдаём только актуальный.
  return loaded && loaded.key === key ? loaded.url : null
}
