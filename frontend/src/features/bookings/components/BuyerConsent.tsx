'use client'

import { useState } from 'react'
import MarkdownText from '@/features/legal/components/MarkdownText'
import type { LegalDocument } from '@/types/legal'
import { LABEL_CLASS } from './section'

interface BuyerConsentProps {
  document: LegalDocument
  checked: boolean
  onChange: (value: boolean) => void
  disabled: boolean
  error?: string
  checkboxId: string
}

/**
 * Текст согласия покупателя приходит с сервера; версия из этого же ответа
 * уходит в `buyerConsentVersion`. Чекбокс по умолчанию пустой — подтверждение
 * должно быть явным.
 */
export function BuyerConsent({
  document,
  checked,
  onChange,
  disabled,
  error,
  checkboxId,
}: BuyerConsentProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {document.title}
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Версия {document.version}
        {document.draft ? ' · черновик' : ''}
      </p>

      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((value) => !value)
        }}
        className="mt-2 text-sm underline underline-offset-4"
      >
        {expanded ? 'Скрыть текст' : 'Показать текст'}
      </button>

      {expanded ? (
        <div className="mt-3 max-h-72 overflow-y-auto rounded-md bg-surface-muted p-3">
          <MarkdownText content={document.content} />
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.checked)
          }}
          aria-invalid={error ? true : undefined}
          className="mt-1 size-4"
        />
        <label htmlFor={checkboxId} className={LABEL_CLASS}>
          Покупатель ознакомлен с формой и дал согласие на обработку
          персональных данных
        </label>
      </div>

      {error ? (
        <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  )
}

export default BuyerConsent
