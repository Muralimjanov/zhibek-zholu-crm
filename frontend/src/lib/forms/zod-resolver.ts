import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form'
import type { ZodType } from 'zod'

/**
 * Резолвер react-hook-form поверх Zod без зависимости @hookform/resolvers.
 * Для каждого поля берётся первая ошибка схемы.
 */
export function createZodResolver<T extends FieldValues>(
  schema: ZodType<T>,
): Resolver<T> {
  return async (values) => {
    const parsed = schema.safeParse(values)

    if (parsed.success) {
      return { values: parsed.data, errors: {} }
    }

    const errors: Record<string, { type: string; message: string }> = {}

    for (const issue of parsed.error.issues) {
      const field = issue.path[0]

      if (typeof field === 'string' && !errors[field]) {
        errors[field] = { type: String(issue.code), message: issue.message }
      }
    }

    return { values: {}, errors: errors as FieldErrors<T> }
  }
}
