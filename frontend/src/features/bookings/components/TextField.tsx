'use client'

import type { ComponentPropsWithRef, ReactNode } from 'react'
import { ERROR_CLASS, FIELD_CLASS, LABEL_CLASS } from './section'

type TextFieldProps = ComponentPropsWithRef<'input'> & {
  id: string
  label: ReactNode
  hint?: string
  error?: string
}

export function TextField({
  id,
  label,
  hint,
  error,
  ...inputProps
}: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId ?? hintId}
        className={FIELD_CLASS}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className={ERROR_CLASS}>
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export default TextField
