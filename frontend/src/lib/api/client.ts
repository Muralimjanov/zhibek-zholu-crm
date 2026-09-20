/**
 * Общий транспорт для staging API.
 *
 * Базовый URL уже содержит `/api/v1`, поэтому endpoint передаётся без этого
 * префикса: `/auth/login`, `/consents/status`, `/bookings`.
 */

export interface ApiErrorBody {
  statusCode?: number
  message?: string | string[]
}

/** Ошибка, у которой сохранены HTTP-статус и код `message` из тела ответа. */
export class ApiError extends Error {
  readonly status: number
  /** Стабильный код ошибки, например `AUTH_INVALID_CREDENTIALS`. */
  readonly code: string | null
  /** Сообщения валидации, когда `message` пришёл массивом (400). */
  readonly validationMessages: string[]
  /** Разобранное тело ответа, если оно было. */
  readonly payload: unknown

  constructor(
    status: number,
    code: string | null,
    validationMessages: string[],
    payload: unknown,
  ) {
    super(code ?? validationMessages[0] ?? `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.validationMessages = validationMessages
    this.payload = payload
  }
}

/** Запрос не дошёл до сервера: обрыв сети, CORS, спящий staging. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('NETWORK_ERROR')
    this.name = 'NetworkError'
    this.cause = cause
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** Access token для защищённых запросов. */
  token?: string | null
  /** Тело, которое нужно сериализовать в JSON; выставляет Content-Type. */
  json?: unknown
  /** Готовое тело запроса (FormData и т.п.) — Content-Type не выставляется. */
  body?: BodyInit | null
  /** Текущий csrfToken для `/auth/refresh` и `/auth/logout`. */
  csrfToken?: string | null
  /** `blob` — для бинарных ответов, например приватного аватара. */
  responseType?: 'json' | 'blob'
}

function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL

  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_API_URL не задан. Скопируйте .env.example в .env.local.',
    )
  }

  return url.replace(/\/+$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseErrorBody(payload: unknown): {
  code: string | null
  validationMessages: string[]
} {
  if (!isRecord(payload)) {
    return { code: null, validationMessages: [] }
  }

  const message = payload.message

  if (typeof message === 'string') {
    return { code: message, validationMessages: [] }
  }

  if (Array.isArray(message)) {
    return {
      code: null,
      validationMessages: message.filter(
        (item): item is string => typeof item === 'string',
      ),
    }
  }

  return { code: null, validationMessages: [] }
}

export async function apiRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    token,
    json,
    csrfToken,
    responseType = 'json',
    headers: initHeaders,
    ...rest
  } = options

  const headers = new Headers(initHeaders)
  let body = rest.body ?? undefined

  if (json !== undefined) {
    body = JSON.stringify(json)

    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (csrfToken) {
    headers.set('x-csrf-token', csrfToken)
  }

  let response: Response

  try {
    response = await fetch(`${getBaseUrl()}${endpoint}`, {
      ...rest,
      body,
      headers,
      credentials: 'include',
    })
  } catch (cause) {
    throw new NetworkError(cause)
  }

  if (!response.ok) {
    const text = await response.text()
    let payload: unknown = null

    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    }

    const { code, validationMessages } = parseErrorBody(payload)

    throw new ApiError(response.status, code, validationMessages, payload)
  }

  if (responseType === 'blob') {
    return (await response.blob()) as T
  }

  const text = await response.text()

  if (!text) {
    return undefined as T
  }

  try {
    return JSON.parse(text) as T
  } catch {
    return text as T
  }
}

/**
 * Совместимая обёртка для кода, написанного до появления `apiRequest`.
 * Content-Type выставляется только для строкового (JSON) тела.
 */
export function apiClient<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers)

  if (
    typeof options.body === 'string' &&
    options.json === undefined &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json')
  }

  return apiRequest<T>(endpoint, { ...options, headers })
}
