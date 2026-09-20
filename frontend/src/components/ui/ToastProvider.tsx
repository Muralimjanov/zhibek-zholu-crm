'use client'

import { CheckCircleIcon, XIcon } from '@phosphor-icons/react/dist/ssr'
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  dismissToast,
  getServerToastsSnapshot,
  getToastsSnapshot,
  pauseToast,
  resumeToast,
  subscribeToToasts,
  type ToastItem,
} from './toast-store'

function useToasts() {
  return useSyncExternalStore(
    subscribeToToasts,
    getToastsSnapshot,
    getServerToastsSnapshot,
  )
}

/**
 * Один цикл объявления одного сообщения. `key={toast.id}` на вызывающей
 * стороне размонтирует и заново монтирует этот компонент при каждом новом
 * toast — свежий инстанс всегда начинает с пустого текста, а эффект лишь
 * проставляет сообщение на следующий кадр. Так DOM реально проходит путь
 * «пусто → текст» даже для двух одинаковых сообщений подряд, что и
 * заставляет скринридер объявить повтор, а не проигнорировать его как
 * отсутствие изменений.
 */
function AnnouncedMessage({ message }: { message: string }) {
  const [text, setText] = useState('')

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setText(message)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [message])

  return text
}

/**
 * Область объявлений для скринридера — постоянно в DOM с первого рендера,
 * даже без единого toast: ARIA ожидает, что live-регион уже существует до
 * того, как в нём меняется текст, иначе объявление может не сработать.
 * Сам элемент никогда не пересоздаётся, меняется только его содержимое.
 * Показывает только последнее сообщение — старые из стопки скринридеру
 * заново зачитывать не нужно.
 */
function ToastAnnouncer({ toast }: { toast: ToastItem | null }) {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {toast ? (
        <AnnouncedMessage key={toast.id} message={toast.message} />
      ) : null}
    </div>
  )
}

/**
 * Видимая карточка. Не несёт своей ARIA live-семантики — объявляет
 * сообщение отдельный `ToastAnnouncer`, а эта карточка только показывает
 * его визуально и даёт закрыть. Наведение и фокус на кнопке закрытия ставят
 * автозакрытие на паузу, чтобы карточка не исчезла неожиданно прямо во
 * время чтения или под фокусом.
 */
function ToastCard({ toast }: { toast: ToastItem }) {
  return (
    <div
      onMouseEnter={() => {
        pauseToast(toast.id)
      }}
      onMouseLeave={() => {
        resumeToast(toast.id)
      }}
      onFocus={() => {
        pauseToast(toast.id)
      }}
      onBlur={() => {
        resumeToast(toast.id)
      }}
      className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-modal border border-zinc-200 bg-surface px-4 py-3 text-sm text-zinc-900 shadow-lg transition-opacity motion-reduce:transition-none dark:border-zinc-700 dark:text-zinc-50"
    >
      <CheckCircleIcon
        size={20}
        weight="fill"
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-success"
      />
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={() => {
          dismissToast(toast.id)
        }}
        aria-label={`Закрыть: ${toast.message}`}
        className="shrink-0 cursor-pointer rounded text-zinc-400 transition-colors hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
      >
        <XIcon size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

/** Стопка toast снизу справа; на узком экране умещается по ширине экрана. */
function ToastViewport() {
  const toasts = useToasts()
  const latest = toasts.length > 0 ? toasts[toasts.length - 1] : null

  return (
    <>
      <ToastAnnouncer toast={latest} />
      {toasts.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4">
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} />
          ))}
        </div>
      ) : null}
    </>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ToastViewport />
    </>
  )
}

export default ToastProvider
