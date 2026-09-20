/**
 * Разбор ответа `GET /consents/status`.
 *
 * Опубликованная OpenAPI-схема не описывает тело этого ответа, в
 * `API_TESTING.md` названо только поле `allRequiredAccepted` и «список
 * обязательных документов» без имени поля. Поэтому здесь нет догадок про
 * конкретные ключи: читается `allRequiredAccepted`, а список обязательных
 * типов документов ищется среди массивов ответа по тем ключам, которые в нём
 * фактически есть. Если список не найден, вызывающий код падает обратно на
 * `GET /legal/documents`.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function readAllRequiredAccepted(payload: unknown): boolean | null {
  if (isRecord(payload) && typeof payload.allRequiredAccepted === 'boolean') {
    return payload.allRequiredAccepted
  }

  return null
}

function readPolicyType(item: unknown): string | null {
  if (typeof item === 'string') {
    return item
  }

  if (!isRecord(item)) {
    return null
  }

  const candidate = item.policyType ?? item.type

  return typeof candidate === 'string' ? candidate : null
}

/**
 * Возвращает типы документов, которые сервер считает обязательными,
 * или `null`, если в ответе нет подходящего списка.
 */
export function readRequiredPolicyTypes(payload: unknown): string[] | null {
  if (!isRecord(payload)) {
    return null
  }

  for (const value of Object.values(payload)) {
    if (!Array.isArray(value) || value.length === 0) {
      continue
    }

    const types = value
      .map(readPolicyType)
      .filter((type): type is string => type !== null)

    if (types.length === value.length) {
      return types
    }
  }

  return null
}
