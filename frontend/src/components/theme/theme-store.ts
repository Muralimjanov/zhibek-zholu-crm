'use client'

import { useSyncExternalStore } from 'react'
import {
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '@/lib/theme'

/**
 * Тот же singleton-паттерн `useSyncExternalStore`, что и
 * `breadcrumb-store.ts`/`session-store.ts`/`toast-store.ts`. Живёт вне
 * бизнес-фич и не зависит от сессии — тема работает на `/login`,
 * `/consents` и во всех защищённых разделах одинаково, logout её не сбрасывает.
 */

let preference: ThemePreference = 'system'
let mediaQuery: MediaQueryList | null = null
let initialized = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

function prefersDarkNow(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

/** Ставит уже посчитанную тему на `<html>` — pre-paint script в layout.tsx делает то же самое до первой отрисовки. */
function applyResolvedTheme() {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.setAttribute(
    'data-theme',
    resolveTheme(preference, prefersDarkNow()),
  )
}

function handleMediaChange() {
  applyResolvedTheme()
}

/** Listener на смену темы ОС активен, только когда выбран `system` — отписывается при переключении на light/dark. */
function syncMediaListener() {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return
  }

  if (preference === 'system') {
    if (!mediaQuery) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', handleMediaChange)
    }
  } else if (mediaQuery) {
    mediaQuery.removeEventListener('change', handleMediaChange)
    mediaQuery = null
  }
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system'
  }

  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function handleStorageEvent(event: StorageEvent) {
  if (event.key !== THEME_STORAGE_KEY) {
    return
  }

  preference = parseThemePreference(event.newValue)
  syncMediaListener()
  applyResolvedTheme()
  emit()
}

function ensureInitialized() {
  if (initialized) {
    return
  }

  initialized = true
  preference = readStoredPreference()
  syncMediaListener()
  applyResolvedTheme()

  if (typeof window !== 'undefined') {
    // Синхронизация между вкладками: `storage` срабатывает только в ДРУГИХ
    // вкладках, не в той, что сделала запись — это ровно то, что нужно.
    window.addEventListener('storage', handleStorageEvent)
  }
}

export function getThemePreference(): ThemePreference {
  ensureInitialized()

  return preference
}

export function setThemePreference(next: ThemePreference): void {
  ensureInitialized()
  preference = next

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // Приватный режим/квота — тема применяется на сессию без сохранения.
  }

  syncMediaListener()
  applyResolvedTheme()
  emit()
}

function subscribe(listener: () => void): () => void {
  ensureInitialized()
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ThemePreference {
  ensureInitialized()

  return preference
}

function getServerSnapshot(): ThemePreference {
  return 'system'
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
