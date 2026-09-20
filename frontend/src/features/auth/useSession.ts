'use client'

import { useSyncExternalStore } from 'react'
import {
  getServerSessionState,
  getSessionState,
  subscribeToSession,
  type SessionState,
} from './session-store'

export function useSession(): SessionState {
  return useSyncExternalStore(
    subscribeToSession,
    getSessionState,
    getServerSessionState,
  )
}
