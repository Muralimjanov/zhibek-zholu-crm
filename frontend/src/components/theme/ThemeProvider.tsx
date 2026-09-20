'use client'

import type { ReactNode } from 'react'
import { useThemePreference } from './theme-store'

/**
 * Не хранит состояние сам — только «включает» singleton-store на этом
 * уровне дерева (подписка через `useThemePreference` инициализирует
 * media-query/`storage`-слушатели). Стоит выше `AuthProvider`, поэтому
 * тема работает на `/login` и `/consents` тоже, не завися от сессии.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useThemePreference()

  return <>{children}</>
}

export default ThemeProvider
