import type { PendingAction } from '@/types/users'

/**
 * Разбор ответов подтверждений.
 *
 * OpenAPI staging объявляет `PendingActionSummaryDto` как объект без свойств,
 * а 202-ответ создания — как общий `object`. Поля pending-элемента взяты из
 * фактического ответа staging; отсутствующее просто становится `null`, ничего
 * не достраивается. 202-ответ по-прежнему читается терпимо: его форма не
 * подтверждена.
 */

/** Ключи, которые нельзя показывать, даже если сервер их неожиданно пришлёт. */
const SECRET_KEY_PATTERN = /pass|code|secret|token|hash|otp|credential/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** Ищет строковое поле по списку имён: сверху, затем на один уровень внутрь. */
function pickString(source: unknown, names: string[]): string | null {
  if (!isRecord(source)) {
    return null
  }

  for (const name of names) {
    if (SECRET_KEY_PATTERN.test(name)) {
      continue
    }

    const direct = readString(source[name])

    if (direct) {
      return direct
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (SECRET_KEY_PATTERN.test(key) || !isRecord(value)) {
      continue
    }

    for (const name of names) {
      const nested = readString(value[name])

      if (nested) {
        return nested
      }
    }
  }

  return null
}

export function readPendingActionId(source: unknown): string | null {
  return pickString(source, ['pendingActionId', 'id', 'actionId'])
}

export function readPendingActions(payload: unknown): PendingAction[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.flatMap((item) => {
    const id = readPendingActionId(item)

    if (!id || !isRecord(item)) {
      return []
    }

    return [
      {
        id,
        type: readString(item.type),
        status: readString(item.status),
        summary: readString(item.summary),
        createdAt: readString(item.createdAt),
        expiresAt: readString(item.expiresAt),
        initiatorUserId: readString(item.initiatorUserId),
      },
    ]
  })
}

/** Запрос уже просрочен по данным сервера. */
export function isPendingActionExpired(
  action: PendingAction,
  now: number = Date.now(),
): boolean {
  if (!action.expiresAt) {
    return false
  }

  const expires = new Date(action.expiresAt).getTime()

  return Number.isFinite(expires) && expires <= now
}

export type EmailDeliveryTone = 'ok' | 'warn' | 'unknown'

export interface EmailDeliveryNotice {
  tone: EmailDeliveryTone
  message: string
}

const DELIVERED = 'Письмо с кодом отправлено на почту директора.'
const NOT_DELIVERED =
  'Письмо с кодом не отправлено. На тестовом сервере это обычно значит, что не настроен SMTP или у директора пустой email.'
const UNKNOWN =
  'Сервер не сообщил, отправлено ли письмо с кодом. Проверьте почту директора, прежде чем ждать код.'

function fromBoolean(value: boolean): EmailDeliveryNotice {
  return value
    ? { tone: 'ok', message: DELIVERED }
    : { tone: 'warn', message: NOT_DELIVERED }
}

/** Закрытый список статусов доставки: новые значения не угадываем. */
const DELIVERED_STATUSES = new Set([
  'sent',
  'delivered',
  'queued',
  'accepted',
  'success',
  'ok',
])

/**
 * Отрицательные признаки проверяются ПЕРВЫМИ и только целиком: `not_sent` и
 * `unsent` содержат подстроку `sent`, поэтому при обратном порядке интерфейс
 * соврал бы про доставку.
 */
const NOT_DELIVERED_PATTERN =
  /(^|[^a-z])(not|un|never|no)[ _-]*(sent|delivered)|fail|error|reject|bounce|skip|disabl|not[ _-]*configured|unavailable|missing|none/

function fromString(value: string): EmailDeliveryNotice {
  const normalized = value.trim().toLowerCase()

  if (NOT_DELIVERED_PATTERN.test(normalized)) {
    return { tone: 'warn', message: NOT_DELIVERED }
  }

  if (DELIVERED_STATUSES.has(normalized)) {
    return { tone: 'ok', message: DELIVERED }
  }

  return { tone: 'unknown', message: UNKNOWN }
}

/**
 * Никогда не утверждает доставку без явного признака от сервера.
 */
export function describeEmailDelivery(value: unknown): EmailDeliveryNotice {
  if (typeof value === 'boolean') {
    return fromBoolean(value)
  }

  if (typeof value === 'string') {
    return fromString(value)
  }

  if (isRecord(value)) {
    for (const key of ['sent', 'delivered', 'ok', 'success']) {
      const flag = value[key]

      if (typeof flag === 'boolean') {
        return fromBoolean(flag)
      }
    }

    for (const key of ['status', 'state', 'result', 'reason']) {
      const text = readString(value[key])

      if (text) {
        return fromString(text)
      }
    }
  }

  return { tone: 'unknown', message: UNKNOWN }
}

/** Достаёт `emailDelivery` из 202-ответа, как бы он ни был назван. */
export function readEmailDelivery(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return undefined
  }

  return payload.emailDelivery ?? payload.email ?? payload.delivery
}
