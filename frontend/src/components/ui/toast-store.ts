import { onSessionReset } from '@/features/auth/session-store'
import {
  MAX_VISIBLE_TOASTS,
  pushToast,
  removeToast,
  type ToastItem,
} from './toast-queue'

export type { ToastItem } from './toast-queue'

/**
 * Глобальное хранилище toast-сообщений — тот же паттерн, что
 * `features/auth/session-store.ts`: модульное состояние + подписка +
 * `useSyncExternalStore` на стороне чтения. `showToast` — обычная функция,
 * её можно звать откуда угодно (например, из `onSuccess` мутации в
 * `queries.ts`), не только из компонента. Саму очередь (добавление, лимит,
 * удаление) считает чистый `toast-queue.ts`.
 */

const AUTO_DISMISS_MS = 5000

/** Стабильная ссылка: `useSyncExternalStore` требует один и тот же снимок между вызовами, иначе React 19 уходит в бесконечный ререндер. */
const EMPTY_TOASTS: ToastItem[] = []

let toasts: ToastItem[] = EMPTY_TOASTS
let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeToToasts(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function getToastsSnapshot(): ToastItem[] {
  return toasts
}

/** До гидратации на сервере сообщений нет и быть не может. */
export function getServerToastsSnapshot(): ToastItem[] {
  return EMPTY_TOASTS
}

function clearTimer(id: number): void {
  const timer = timers.get(id)

  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
}

/**
 * Наведение курсора или фокус на карточке ставят автозакрытие на паузу —
 * иначе таймер мог бы убрать toast прямо во время чтения или пока на его
 * кнопке закрытия стоит фокус, неожиданно потеряв его.
 */
export function pauseToast(id: number): void {
  clearTimer(id)
}

/** Возобновляет автозакрытие с полным сроком — после ухода курсора/фокуса. */
export function resumeToast(id: number): void {
  if (timers.has(id) || !toasts.some((toast) => toast.id === id)) {
    return
  }

  timers.set(
    id,
    setTimeout(() => {
      dismissToast(id)
    }, AUTO_DISMISS_MS),
  )
}

export function dismissToast(id: number): void {
  clearTimer(id)

  const next = removeToast(toasts, id)

  if (next.length === toasts.length) {
    return
  }

  toasts = next
  notify()
}

/**
 * Показать toast. Вызывать только после подтверждённого успеха действия
 * (см. `CLAUDE_SUCCESS_TOASTS_TASK.md`) — не из рендера компонента и не из
 * эффекта, следящего за `isSuccess`, чтобы повторный рендер или инвалидация
 * запроса не показали сообщение дважды.
 */
export function showToast(message: string): void {
  const id = nextId++
  const evictedId =
    toasts.length >= MAX_VISIBLE_TOASTS ? toasts[0]?.id : undefined

  toasts = pushToast(toasts, { id, message })

  if (evictedId !== undefined) {
    clearTimer(evictedId)
  }

  timers.set(
    id,
    setTimeout(() => {
      dismissToast(id)
    }, AUTO_DISMISS_MS),
  )

  notify()
}

function clearAllToasts(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer)
  }

  timers.clear()

  if (toasts.length === 0) {
    return
  }

  toasts = []
  notify()
}

/** Toast прошлой роли не должен пережить выход из аккаунта. */
onSessionReset(clearAllToasts)
