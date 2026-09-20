import { ApiError, apiRequest, type ApiRequestOptions } from '@/lib/api/client'
import {
  readAllRequiredAccepted,
  readRequiredPolicyTypes,
} from '@/features/legal/consent-status'
import type {
  LoginChallenge,
  LoginRequest,
  LoginVerifyRequest,
  User,
} from '@/types/auth'
import {
  requestConsentStatus,
  requestLogin,
  requestLoginVerify,
  requestLogout,
  requestMe,
  requestRefresh,
} from './api'
import { readLoginChallenge, readLoginVerifyResponse } from './loginFlow'
import {
  getAccessToken,
  getCsrfToken,
  getSessionState,
  notifySessionReset,
  setAccessToken,
  setCsrfToken,
  setSessionState,
} from './session-store'

export const CONSENT_REQUIRED_CODE = 'CONSENT_REQUIRED'

/** Список обязательных документов из последнего ответа `/consents/status`. */
let requiredPolicyTypes: string[] | null = null

export function getRequiredPolicyTypes(): string[] | null {
  return requiredPolicyTypes
}

function clearTokens(): void {
  setAccessToken(null)
  setCsrfToken(null)
}

export function clearSession(): void {
  clearTokens()
  requiredPolicyTypes = null
  notifySessionReset()
  setSessionState({
    status: 'unauthenticated',
    user: null,
    consent: 'unknown',
    consentError: null,
  })
}

/** Обновляет пользователя в общем состоянии после PATCH/PUT/DELETE профиля. */
export function updateSessionUser(user: User): void {
  setSessionState({ user })
}

/** Заставляет перезагрузить картинку аватара, `avatarUrl` при замене не меняется. */
export function bumpAvatarVersion(): void {
  setSessionState({ avatarVersion: getSessionState().avatarVersion + 1 })
}

export function markConsentRequired(): void {
  setSessionState({ consent: 'required', consentError: null })
}

/* -------------------------------------------------------------------------- */
/* Обновление токена: один refresh на группу одновременных запросов            */
/* -------------------------------------------------------------------------- */

let refreshPromise: Promise<boolean> | null = null

async function runRefresh(): Promise<boolean> {
  const csrfToken = getCsrfToken()

  if (!csrfToken) {
    return false
  }

  try {
    const result = await requestRefresh(csrfToken)

    setAccessToken(result.accessToken)
    setCsrfToken(result.csrfToken)

    return true
  } catch {
    // Ротируемая refresh-cookie больше не действует: сессию нужно начать заново.
    clearTokens()

    return false
  }
}

/**
 * Возвращает общий промис обновления токена. Параллельные 401 разделяют один
 * запрос `/auth/refresh`, иначе повторное использование старой refresh-cookie
 * завершит всю цепочку сессий.
 */
export function refreshSession(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise
  }

  const pending = runRefresh().finally(() => {
    if (refreshPromise === pending) {
      refreshPromise = null
    }
  })

  refreshPromise = pending

  return pending
}

/* -------------------------------------------------------------------------- */
/* Защищённые запросы                                                          */
/* -------------------------------------------------------------------------- */

function handleConsentError(error: unknown): void {
  if (
    error instanceof ApiError &&
    error.status === 403 &&
    error.code === CONSENT_REQUIRED_CODE
  ) {
    markConsentRequired()
  }
}

async function retryOnce<T>(
  endpoint: string,
  options: ApiRequestOptions,
): Promise<T> {
  try {
    return await apiRequest<T>(endpoint, {
      ...options,
      token: getAccessToken(),
    })
  } catch (retryError) {
    handleConsentError(retryError)

    if (retryError instanceof ApiError && retryError.status === 401) {
      clearSession()
    }

    throw retryError
  }
}

/**
 * Запрос с Bearer-токеном. После 401 запрос повторяется ровно один раз.
 *
 * Если пока запрос был в пути другой параллельный запрос уже обновил access
 * token, повтор идёт сразу с новым токеном — без второго `refresh`. Это
 * избавляет от лишней ротации refresh-cookie на запоздавших 401.
 */
export async function authorizedRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const tokenUsed = getAccessToken()

  try {
    return await apiRequest<T>(endpoint, { ...options, token: tokenUsed })
  } catch (error) {
    handleConsentError(error)

    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error
    }

    const currentToken = getAccessToken()
    const alreadyRefreshed = currentToken !== null && currentToken !== tokenUsed

    if (!alreadyRefreshed) {
      const refreshed = await refreshSession()

      if (!refreshed) {
        clearSession()

        throw error
      }
    }

    return retryOnce<T>(endpoint, options)
  }
}

/* -------------------------------------------------------------------------- */
/* Согласия                                                                    */
/* -------------------------------------------------------------------------- */

const CONSENT_STATUS_MISMATCH =
  'Ответ /consents/status не содержит поля allRequiredAccepted. ' +
  'Сверьте контракт с backend.'

/**
 * Проверяет обязательные согласия. Возвращает `true`, если все обязательные
 * документы приняты.
 */
export async function checkConsents(): Promise<boolean> {
  const token = getAccessToken()

  if (!token) {
    return false
  }

  try {
    const payload = await requestConsentStatus(token)
    const accepted = readAllRequiredAccepted(payload)

    requiredPolicyTypes = readRequiredPolicyTypes(payload)

    if (accepted === null) {
      setSessionState({
        consent: 'unknown',
        consentError: CONSENT_STATUS_MISMATCH,
      })

      return false
    }

    setSessionState({
      consent: accepted ? 'granted' : 'required',
      consentError: null,
    })

    return accepted
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 403 &&
      error.code === CONSENT_REQUIRED_CODE
    ) {
      setSessionState({ consent: 'required', consentError: null })

      return false
    }

    if (error instanceof ApiError && error.status === 401) {
      clearSession()

      return false
    }

    setSessionState({
      consent: 'unknown',
      consentError: 'Не удалось проверить согласия.',
    })

    return false
  }
}

/* -------------------------------------------------------------------------- */
/* Вход, восстановление и выход                                                */
/* -------------------------------------------------------------------------- */

async function loadUserAndConsents(): Promise<boolean> {
  const token = getAccessToken()

  if (!token) {
    clearSession()

    return false
  }

  try {
    const user = await requestMe(token)

    setSessionState({ status: 'authenticated', user })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearSession()

      return false
    }

    throw error
  }

  await checkConsents()

  return true
}

/**
 * Ответ содержит несуществующий пока факт («сервер выдал именно такой
 * challenge»), поэтому это не `ApiError`, а отдельная ошибка формата.
 */
export class LoginResponseFormatError extends Error {
  constructor() {
    super('Сервер ответил не тем форматом, который ожидает клиент.')
    this.name = 'LoginResponseFormatError'
  }
}

/**
 * Шаг 1 (API 0.2.0): логин и пароль. Токена и сессии здесь ещё нет — только
 * challenge для шага 2. Пароль дальше нигде не сохраняется.
 */
export async function startLogin(
  credentials: LoginRequest,
): Promise<LoginChallenge> {
  const payload = await requestLogin(credentials)
  const challenge = readLoginChallenge(payload)

  if (!challenge) {
    throw new LoginResponseFormatError()
  }

  return challenge
}

/**
 * Шаг 2: код из письма. Только здесь появляются access/csrf-токены и
 * начинается сессия — до этого защищённый кабинет не открывается.
 */
export async function verifyLogin(input: LoginVerifyRequest): Promise<void> {
  const payload = await requestLoginVerify(input)
  const result = readLoginVerifyResponse(payload)

  if (!result) {
    throw new LoginResponseFormatError()
  }

  setAccessToken(result.accessToken)
  setCsrfToken(result.csrfToken)

  await loadUserAndConsents()
}

/**
 * Восстановление сессии при загрузке приложения: если в sessionStorage есть
 * csrfToken, один раз выполняется refresh, затем `me` и проверка согласий.
 */
export async function restoreSession(): Promise<void> {
  setSessionState({ status: 'loading' })

  if (!getCsrfToken()) {
    clearSession()

    return
  }

  const refreshed = await refreshSession()

  if (!refreshed) {
    clearSession()

    return
  }

  try {
    await loadUserAndConsents()
  } catch {
    clearSession()
  }
}

export async function logout(): Promise<void> {
  const csrfToken = getCsrfToken()

  try {
    if (csrfToken) {
      await requestLogout(csrfToken)
    }
  } catch {
    // Локальное состояние очищаем в любом случае.
  } finally {
    clearSession()
  }
}
