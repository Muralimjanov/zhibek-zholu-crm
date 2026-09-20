'use client'

import { DesktopIcon, MoonIcon, SunIcon } from '@phosphor-icons/react/dist/ssr'
import { useId } from 'react'
import type { ThemePreference } from '@/lib/theme'
import { setThemePreference, useThemePreference } from './theme-store'

type PhosphorIcon = typeof SunIcon

const OPTIONS: { value: ThemePreference; label: string; icon: PhosphorIcon }[] =
  [
    { value: 'system', label: 'Системная', icon: DesktopIcon },
    { value: 'light', label: 'Светлая', icon: SunIcon },
    { value: 'dark', label: 'Тёмная', icon: MoonIcon },
  ]

/**
 * Доступный segmented radio control (не кастомная ARIA-имитация): каждый
 * вариант — настоящий `<input type="radio">`, визуально скрытый (`sr-only`,
 * не `display:none` — иначе выпадет из фокуса и Tab-порядка), видимый вид
 * рисует соседний `<span>` через `peer-*`. Клик по `<label>` активирует
 * скрытый input нативно, стрелки/Tab работают сами — без ручной клавиатурной
 * логики. Изменение применяется сразу, без кнопки «Сохранить».
 */
export function ThemeSelector() {
  const preference = useThemePreference()
  const name = useId()

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Оформление"
        className="inline-flex flex-wrap gap-2"
      >
        {OPTIONS.map((option) => {
          const Icon = option.icon
          const checked = preference === option.value

          return (
            <label key={option.value} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => {
                  setThemePreference(option.value)
                }}
                className="peer sr-only"
              />
              <span
                className={`flex min-h-11 items-center gap-2 rounded-control border px-4 text-sm font-medium transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 ${
                  checked
                    ? 'border-brand-600 bg-brand-600 text-on-brand'
                    : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                {option.label}
              </span>
            </label>
          )
        })}
      </div>

      <p className="mt-2 text-xs text-muted">
        Настройка сохраняется только на этом устройстве.
      </p>
    </div>
  )
}

export default ThemeSelector
