'use client'

import { useEffect, type ReactNode } from 'react'
import { restoreSession } from './session'
import { getSessionState } from './session-store'

/**
 * Один раз за загрузку страницы пытается восстановить сессию.
 * До окончания проверки состояние сессии остаётся `loading`, поэтому
 * защищённые страницы ничего не показывают.
 *
 * Признак «проверка уже идёт» берётся из самого состояния, а не из флага в
 * модуле: иначе после Fast Refresh модуль мог сохранить поднятый флаг при
 * сброшенном состоянии, и страница залипала на экране загрузки.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (getSessionState().status !== 'idle') {
      return
    }

    void restoreSession()
  }, [])

  return <>{children}</>
}

export default AuthProvider
