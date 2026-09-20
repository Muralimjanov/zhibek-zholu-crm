import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { SECTION_CLASS } from '@/features/bookings/components/section'

interface KpiIconProps {
  size?: number
  'aria-hidden'?: boolean | 'true' | 'false'
}

/**
 * Одна карточка метрики (дизайн-контракт, п.6 — KPI ряд). Значение — всегда
 * готовая строка из вызывающего кода (например, `formatTyiynAsSom`), не
 * число: карточка не форматирует и не пересчитывает.
 *
 * `compactValue` — только для длинных денежных сумм: становится главной
 * строкой, а `value` (точное) уходит в подпись «Точно» — число никогда не
 * переносится и не обрезается многоточием, доступной альтернативы такому
 * обрезанию нет.
 */
export function KpiCard({
  label,
  value,
  compactValue,
  context,
  href,
  icon: Icon,
}: {
  label: ReactNode
  value: ReactNode
  compactValue?: ReactNode
  context?: ReactNode
  href?: string
  icon?: ComponentType<KpiIconProps>
}) {
  const className = `${SECTION_CLASS} flex min-w-0 min-h-32 flex-col gap-1.5 border-t-4 border-t-brand-500 transition-shadow${href ? ' hover:shadow-md' : ''}`

  const body = (
    <>
      <div className="flex items-center gap-2">
        {Icon ? (
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-control bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
          >
            <Icon size={16} aria-hidden="true" />
          </span>
        ) : null}
        <p className="min-w-0 truncate text-caption font-medium text-muted">
          {label}
        </p>
      </div>

      <p className="whitespace-nowrap text-kpi-mobile font-bold tabular-nums tracking-tight text-zinc-900 lg:text-kpi dark:text-zinc-50">
        {compactValue ?? value}
      </p>

      {compactValue ? (
        <p className="whitespace-nowrap text-caption text-muted">
          Точно: {value}
        </p>
      ) : null}

      {context ? (
        <p className="whitespace-nowrap text-caption text-muted">{context}</p>
      ) : null}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    )
  }

  return <div className={className}>{body}</div>
}

export default KpiCard
