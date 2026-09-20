/**
 * `POST /email-codes` защищает существующие мутации кодом на почту (API
 * 0.2.0, см. `CLAUDE_API_V02_MIGRATION.md`, раздел 3). Список действий взят
 * дословно из enum `RequestEmailCodeDto.action` в OpenAPI — используются
 * пока только `contract.deposit`, `contract.file` и `user.email.change`;
 * остальные перечислены для точности типа, реализация — в соответствующих
 * будущих этапах.
 *
 * Модуль намеренно не делает сетевых запросов и не импортирует `session.ts`:
 * запрос кода живёт в `api.ts` рядом с остальным транспортом, а здесь только
 * чистый разбор ответа и построение заголовков — без этого модуль было бы
 * невозможно тестировать напрямую через `node --experimental-strip-types`
 * (Node требует явное расширение файла у относительных импортов, а `api.ts`
 * → `session.ts` тянет длинную цепочку зависимостей).
 */
export type EmailCodeAction =
  | 'booking.delete'
  | 'contract.delete'
  | 'contract.deposit'
  | 'contract.file'
  | 'shift.update'
  | 'shift.delete'
  | 'day_off.delete'
  | 'payroll.settings.update'
  | 'payroll.confirm'
  | 'payroll.delete'
  | 'transaction.create'
  | 'transaction.update'
  | 'transaction.delete'
  | 'transaction.attachment'
  | 'accounting.period.close'
  | 'user.email.change'
  | 'user.password.change'
  | 'backup.export'

export interface EmailCodeChallenge {
  challengeId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * Тело ответа `POST /email-codes` в OpenAPI объявлено как пустой `object` —
 * имя поля с challenge не подтверждено схемой. Разбор терпимый: пробуем
 * `challengeId`, затем `id`, как в остальных местах этого проекта, где
 * сервер не публикует форму ответа (см. `users/pending.ts`).
 */
export function readEmailCodeChallenge(
  payload: unknown,
): EmailCodeChallenge | null {
  if (!isRecord(payload)) {
    return null
  }

  const challengeId = readString(payload.challengeId) ?? readString(payload.id)

  return challengeId ? { challengeId } : null
}

/**
 * Заголовки защищённого запроса, который код подтверждает. Ни challenge,
 * ни код никогда не попадают в localStorage/sessionStorage/URL/лог —
 * только сюда, напрямую в заголовки одного запроса.
 */
export function confirmationHeaders(
  challengeId: string,
  code: string,
): HeadersInit {
  return {
    'x-confirmation-id': challengeId,
    'x-confirmation-code': code,
  }
}
