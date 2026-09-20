import type { ReactNode } from 'react'
import {
  ALERT_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'

/** Единый вид ошибки загрузки данных с кнопкой повторной попытки — заменяет разрозненные копии по экранам. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: ReactNode
  onRetry: () => void
}) {
  return (
    <div className="space-y-3">
      <p role="alert" className={ALERT_CLASS}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className={SECONDARY_BUTTON_CLASS}
      >
        Повторить
      </button>
    </div>
  )
}

export default ErrorState
