import { onSessionReset } from '@/features/auth/session-store'

/**
 * Реестр живых object URL аватаров. Нужен, чтобы при выходе приватная
 * картинка не осталась в памяти и не досталась следующему пользователю.
 */
const liveUrls = new Set<string>()

onSessionReset(() => {
  for (const url of liveUrls) {
    URL.revokeObjectURL(url)
  }

  liveUrls.clear()
})

export function trackObjectUrl(url: string): void {
  liveUrls.add(url)
}

export function releaseObjectUrl(url: string): void {
  if (liveUrls.delete(url)) {
    URL.revokeObjectURL(url)
  }
}
