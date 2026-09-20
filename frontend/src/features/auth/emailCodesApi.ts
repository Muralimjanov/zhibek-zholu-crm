import { authorizedRequest } from './session'
import type { EmailCodeAction } from './emailCodes'

/**
 * Сетевой вызов `POST /email-codes` — отдельно от чистого разбора в
 * `emailCodes.ts` (см. комментарий там о причине разделения).
 */
export function requestEmailCode(action: EmailCodeAction, resourceId?: string) {
  return authorizedRequest<unknown>('/email-codes', {
    method: 'POST',
    json: resourceId ? { action, resourceId } : { action },
  })
}
