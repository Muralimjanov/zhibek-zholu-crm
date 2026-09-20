import type { User } from '@/types/auth'

/**
 * Состояние сессии.
 *
 * Access token хранится только в памяти модуля и никогда не попадает в
 * localStorage, sessionStorage, cookie или URL. В sessionStorage сохраняется
 * только csrfToken — это явно согласовано владельцем проекта и нужно, чтобы
 * восстановить сессию после обновления вкладки.
 */

export type SessionStatus =
  'idle' | 'loading' | 'authenticated' | 'unauthenticated'

export type ConsentState = 'unknown' | 'granted' | 'required'

export interface SessionState {
  status: SessionStatus
  user: User | null
  consent: ConsentState
  /** Текст ошибки, если проверку согласий не удалось выполнить. */
  consentError: string | null
  /**
   * Счётчик версии аватара. `avatarUrl` у пользователя не меняется при замене
   * фотографии, поэтому перезагрузку картинки запускает этот счётчик.
   */
  avatarVersion: number
}

const CSRF_STORAGE_KEY = 'uzz-crm.csrf-token'

const INITIAL_STATE: SessionState = {
  status: 'idle',
  user: null,
  consent: 'unknown',
  consentError: null,
  avatarVersion: 0,
}

let state: SessionState = INITIAL_STATE
let accessToken: string | null = null
let csrfToken: string | null = null
let csrfRestored = false

const listeners = new Set<() => void>()
const resetListeners = new Set<() => void>()

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function getSessionState(): SessionState {
  return state
}

/** Снимок для серверного рендера: до гидратации сессия всегда неизвестна. */
export function getServerSessionState(): SessionState {
  return INITIAL_STATE
}

export function setSessionState(patch: Partial<SessionState>): void {
  const next: SessionState = { ...state, ...patch }
  const changed = (Object.keys(next) as (keyof SessionState)[]).some(
    (key) => next[key] !== state[key],
  )

  if (!changed) {
    return
  }

  state = next

  for (const listener of listeners) {
    listener()
  }
}

/**
 * Подписка на сброс сессии: сюда модули вешают очистку приватных данных,
 * например object URL аватара, чтобы они не достались следующему пользователю.
 */
export function onSessionReset(listener: () => void): () => void {
  resetListeners.add(listener)

  return () => {
    resetListeners.delete(listener)
  }
}

export function notifySessionReset(): void {
  for (const listener of resetListeners) {
    listener()
  }
}

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getCsrfToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  if (!csrfRestored) {
    csrfRestored = true

    try {
      csrfToken = window.sessionStorage.getItem(CSRF_STORAGE_KEY)
    } catch {
      csrfToken = null
    }
  }

  return csrfToken
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token
  csrfRestored = true

  if (typeof window === 'undefined') {
    return
  }

  try {
    if (token) {
      window.sessionStorage.setItem(CSRF_STORAGE_KEY, token)
    } else {
      window.sessionStorage.removeItem(CSRF_STORAGE_KEY)
    }
  } catch {
    // Приватный режим браузера может запрещать запись — это не критично.
  }
}
