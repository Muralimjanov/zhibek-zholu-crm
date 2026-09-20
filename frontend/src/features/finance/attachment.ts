/**
 * Проверка вложения перед загрузкой. Модуль намеренно не импортирует
 * транспорт (`api.ts`), чтобы быть тестируемым напрямую через
 * `node --experimental-strip-types` — та же причина, что у разделения
 * `auth/emailCodes.ts` (чистая логика) и `auth/emailCodesApi.ts` (транспорт).
 */

/** Только подсказка для атрибута `accept` файлового инпута — не источник истины для валидации. */
export const TRANSACTION_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
]

/**
 * 10 МБ — подтверждено описанием маршрута в опубликованной схеме API 0.3.0
 * (`PUT /transactions/{id}/attachment`: "PDF, JPEG или PNG, до 10 МБ"), не
 * предположение по аналогии с файлом договора.
 */
export const TRANSACTION_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

/**
 * Тип файла не проверяем: API 0.3.0 определяет PDF/JPEG/PNG по содержимому,
 * а не по `File.type` — это заголовок, который присылает браузер по
 * расширению или вообще не присылает (пустая строка), и клиенту доверять
 * ему нельзя. `accept` на самом `<input type="file">` — только подсказка
 * при выборе; отклонить неподдерживаемое содержимое должен сервер, а не
 * ложный отказ здесь по пустому/неверному `File.type`. Размер — единственное,
 * что клиент может проверить надёжно.
 */
export function validateTransactionAttachment(file: {
  size: number
}): string | null {
  if (file.size > TRANSACTION_ATTACHMENT_MAX_BYTES) {
    return 'Файл больше 10 МБ.'
  }

  return null
}
