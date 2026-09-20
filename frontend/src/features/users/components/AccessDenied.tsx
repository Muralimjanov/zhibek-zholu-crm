import Link from 'next/link'
import { SECTION_CLASS } from './section'

export function AccessDenied() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className={SECTION_CLASS}>
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Нет доступа
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Раздел пользователей доступен директору и начальнику отдела продаж.
          Если доступ нужен по работе, обратитесь к руководителю.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
        >
          Вернуться на главную
        </Link>
      </div>
    </div>
  )
}

export default AccessDenied
