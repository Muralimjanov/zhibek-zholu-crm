'use client'

import { useRef, useSyncExternalStore, type ChangeEvent, type ReactNode } from 'react'

/** Медиазапрос сенсорного устройства: на нём есть смысл предлагать камеру. */
const COARSE_POINTER = '(pointer: coarse)'

function subscribeToPointer(onChange: () => void): () => void {
  const query = window.matchMedia(COARSE_POINTER)

  query.addEventListener('change', onChange)

  return () => query.removeEventListener('change', onChange)
}

/**
 * Выбор документа: файлом или сразу с камеры.
 *
 * На телефоне `capture="environment"` открывает основную камеру, минуя
 * выбор источника — так сотрудник фотографирует подписанный договор или
 * чек прямо на месте. Кнопка «Сфотографировать» появляется только на
 * устройствах с сенсорным вводом: на компьютере `capture` игнорируется и
 * открылся бы обычный диалог файлов, что сбивает с толку.
 *
 * Тип устройства читается через `useSyncExternalStore`: на сервере снимок
 * всегда `false`, поэтому серверная разметка и первый клиентский кадр
 * совпадают и гидратация не ломается.
 */
export interface DocumentPickerProps {
  /** MIME-типы, которые принимает сервер. */
  accept: string
  /** Подпись кнопки выбора файла. */
  chooseLabel: string
  onSelect: (file: File) => void
  disabled?: boolean
  buttonClassName: string
  /** Подсказка под кнопками: размер, форматы, что будет дальше. */
  hint?: ReactNode
}

export default function DocumentPicker({
  accept,
  chooseLabel,
  onSelect,
  disabled = false,
  buttonClassName,
  hint,
}: DocumentPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const hasCamera = useSyncExternalStore(
    subscribeToPointer,
    () => window.matchMedia(COARSE_POINTER).matches,
    () => false,
  )

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    // Значение сбрасывается, иначе повторный выбор того же файла не даст
    // события change и пользователь решит, что кнопка не работает.
    event.target.value = ''

    if (file) {
      onSelect(file)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className={buttonClassName}
        >
          {chooseLabel}
        </button>

        {hasCamera ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => cameraInputRef.current?.click()}
            className={buttonClassName}
          >
            Сфотографировать
          </button>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
      />
      {/* Отдельный вход для камеры: снимок всегда приходит картинкой. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
      />

      {hint}
    </div>
  )
}
