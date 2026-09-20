/**
 * Чистая логика темы оформления (без DOM/localStorage) — сознательно
 * отделена от `theme-store.ts`, чтобы резолвинг предпочтения проверялся
 * unit-тестами без браузерного окружения (`node --experimental-strip-types`).
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** Не данные сессии — не должен очищаться при logout, поэтому отдельный ключ, не рядом с session-store. */
export const THEME_STORAGE_KEY = 'uzz-crm-theme'

const KNOWN_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
]

/** Неизвестное, отсутствующее или повреждённое значение — всегда `system`, а не молчаливый light/dark по умолчанию. */
export function parseThemePreference(raw: unknown): ThemePreference {
  return typeof raw === 'string' &&
    (KNOWN_PREFERENCES as readonly string[]).includes(raw)
    ? (raw as ThemePreference)
    : 'system'
}

/** `light`/`dark` всегда побеждают системную настройку; `system` резолвится по фактическому `prefersDark`. */
export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === 'light') {
    return 'light'
  }

  if (preference === 'dark') {
    return 'dark'
  }

  return prefersDark ? 'dark' : 'light'
}
