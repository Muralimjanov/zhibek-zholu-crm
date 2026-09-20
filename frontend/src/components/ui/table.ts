/**
 * Общие классы для таблиц данных — раньше каждая таблица (брони, договоры,
 * начисления, смены, операции, пользователи) заново объявляла одинаковые
 * `CELL`/`HEAD`. Вынесено сюда, чтобы визуальный язык таблиц менялся в
 * одном месте.
 */

export const TABLE_HEAD_ROW_CLASS =
  'border-b border-zinc-200 dark:border-zinc-800'

export const TABLE_HEAD_CELL_CLASS =
  'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400'

export const TABLE_ROW_CLASS =
  'border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/60'

export const TABLE_CELL_CLASS =
  'px-3 py-3 align-top text-sm tabular-nums text-zinc-600 dark:text-zinc-400'

export const TABLE_CELL_STRONG_CLASS =
  'px-3 py-3 align-top text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-50'
