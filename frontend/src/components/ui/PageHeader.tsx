import type { ReactNode } from 'react'

/**
 * Единая шапка страницы (дизайн-контракт, п.5): eyebrow/breadcrumb,
 * заголовок, короткое пояснение, главное действие справа, фильтры/контекст
 * ниже. Раздельно от `AppShell`'s topbar — CTA конкретной страницы живёт
 * здесь, а не в глобальной шапке, чтобы не терять контекст при переходах.
 *
 * Заголовок — настоящий `<h1>` (единственный на странице): `AppShell` не
 * держит собственный скрытый `h1`, поэтому каждый защищённый экран отвечает
 * за свой через `PageHeader`. `headingLevel={2}` — редкий случай, когда
 * экран уже показывает свой `<h1>` в другом месте (например, внутри
 * dedicated состояния) и здесь нужен подзаголовок уровнем ниже.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  children,
  headingLevel = 1,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children?: ReactNode
  headingLevel?: 1 | 2
}) {
  const HeadingTag = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-caption font-semibold uppercase tracking-wide text-muted">
              {eyebrow}
            </p>
          ) : null}
          <HeadingTag className="text-page-title font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {title}
          </HeadingTag>
          {description ? (
            <p className="mt-1 text-body text-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div>{children}</div> : null}
    </header>
  )
}

export default PageHeader
