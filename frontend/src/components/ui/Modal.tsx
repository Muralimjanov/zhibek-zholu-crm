'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { XIcon } from '@phosphor-icons/react/dist/ssr'

/**
 * Нативный `<dialog>`: браузер сам даёт модальный фокус-трап, закрытие по
 * Escape и затемнение фона — без своей реализации доступности с нуля.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current

    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="m-auto max-h-[85vh] w-full max-w-lg rounded-modal border border-zinc-200 bg-surface-raised p-0 text-zinc-900 shadow-lg backdrop:bg-zinc-900/50 dark:border-zinc-800 dark:text-zinc-50 dark:backdrop:bg-black/70"
    >
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 lg:size-9 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        >
          <XIcon size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-[65vh] overflow-y-auto px-5 py-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {children}
      </div>
    </dialog>
  )
}

export default Modal
