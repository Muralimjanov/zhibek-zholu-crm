'use client'

import { useState } from 'react'
import { describeApiError } from './error-messages'
import {
  confirmationHeaders,
  readEmailCodeChallenge,
  type EmailCodeAction,
} from './emailCodes'
import { requestEmailCode } from './emailCodesApi'

export type EmailCodeConfirmPhase = 'idle' | 'requesting' | 'awaiting-code'

/**
 * Состояние запроса кода для одного защищённого действия
 * (`contract.deposit`, `contract.file`, …). Код и итоговый запрос
 * подтверждает сам вызывающий компонент — этот хук только доводит до
 * заголовков `x-confirmation-*`, ничего не отправляет автоматически.
 */
export function useEmailCodeConfirm(
  action: EmailCodeAction,
  resourceId?: string,
) {
  const [phase, setPhase] = useState<EmailCodeConfirmPhase>('idle')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const requestCode = async () => {
    setError(null)
    setPhase('requesting')

    try {
      const payload = await requestEmailCode(action, resourceId)
      const challenge = readEmailCodeChallenge(payload)

      if (!challenge) {
        setError('Сервер не вернул номер запроса кода. Попробуйте ещё раз.')
        setPhase('idle')

        return
      }

      setChallengeId(challenge.challengeId)
      setPhase('awaiting-code')
    } catch (requestError) {
      setError(describeApiError(requestError))
      setPhase('idle')
    }
  }

  const reset = () => {
    setPhase('idle')
    setChallengeId(null)
    setError(null)
  }

  const headersFor = (code: string): HeadersInit => {
    if (!challengeId) {
      throw new Error('Код ещё не запрошен.')
    }

    return confirmationHeaders(challengeId, code)
  }

  return { phase, error, setError, requestCode, reset, headersFor }
}
