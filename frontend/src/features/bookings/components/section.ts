/**
 * Общие классы форм и карточек — переиспользуются во всех модулях (28+
 * файлов). Меняя визуальный язык здесь, меняем его во всём приложении разом.
 */

export const SECTION_CLASS =
  'rounded-card border border-zinc-200 bg-surface p-5 shadow-sm dark:border-zinc-800'

export const SECTION_TITLE_CLASS =
  'text-section-title font-semibold tracking-tight text-zinc-900 dark:text-zinc-50'

export const FIELD_CLASS =
  'w-full rounded-control border border-zinc-300 bg-surface px-3 py-2 text-sm text-zinc-900 shadow-xs outline-none transition-colors focus-visible:border-brand-600 disabled:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:disabled:bg-zinc-900/40'

/** `min-h-11` (44px) — минимальная touch-цель (дизайн-контракт), padding не меняем. */
export const PRIMARY_BUTTON_CLASS =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control bg-brand-600 px-4 py-2.5 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60'

export const SECONDARY_BUTTON_CLASS =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'

/**
 * Только для действий, которые нельзя отменить (отмена брони, удаление и
 * т.п.) — обычный CTA (`PRIMARY_BUTTON_CLASS`, бренд-бирюзовый) не должен
 * быть цветом необратимого подтверждения: пользователь не должен путать
 * «продолжить обычное действие» и «это уже не откатить». Красный
 * фиксирован в обеих темах — в отличие от бренда, у предупреждения нет
 * причины менять оттенок между светлой и тёмной темой.
 */
export const DANGER_BUTTON_CLASS =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60'

export const LABEL_CLASS =
  'block text-sm font-medium text-zinc-700 dark:text-zinc-300'

export const ERROR_CLASS = 'text-sm text-danger'

export const ALERT_CLASS =
  'rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger dark:border-red-900 dark:bg-red-950'

export const NOTICE_CLASS =
  'rounded-control border border-zinc-200 bg-surface-muted px-3 py-2 text-sm text-zinc-800 dark:border-zinc-800 dark:text-zinc-200'
