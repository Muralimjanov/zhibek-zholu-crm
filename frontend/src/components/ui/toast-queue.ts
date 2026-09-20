/**
 * Чистая логика очереди toast-сообщений — без импортов, поэтому напрямую
 * тестируется через `node --experimental-strip-types --test` (см.
 * `toast.test.ts`). Управление состоянием, таймерами и подпиской на выход
 * из сессии — в `toast-store.ts`.
 */

export interface ToastItem {
  id: number
  message: string
}

/** Больше этого числа сообщений одновременно не показываем — не даём быстрым действиям завалить угол экрана. */
export const MAX_VISIBLE_TOASTS = 3

/** Добавляет сообщение в конец очереди; при переполнении убирает самое старое. */
export function pushToast(
  toasts: readonly ToastItem[],
  item: ToastItem,
): ToastItem[] {
  const next = [...toasts, item]

  return next.length > MAX_VISIBLE_TOASTS
    ? next.slice(next.length - MAX_VISIBLE_TOASTS)
    : next
}

export function removeToast(
  toasts: readonly ToastItem[],
  id: number,
): ToastItem[] {
  return toasts.filter((toast) => toast.id !== id)
}
