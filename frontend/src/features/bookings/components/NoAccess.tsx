import Link from 'next/link'
import { SECTION_CLASS } from './section'

export function NoAccess({ reason }: { reason?: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className={SECTION_CLASS}>
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Нет доступа
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {reason ??
            'Бронирования доступны директору, начальнику отдела продаж и менеджерам. Если доступ нужен по работе, обратитесь к руководителю.'}
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

export default NoAccess
