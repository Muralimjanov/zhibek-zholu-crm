'use client'

import { ListIcon, XIcon } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSession } from '@/features/auth/useSession'
import { APP_NAME } from '@/lib/constants'
import { useBreadcrumb } from './breadcrumb-store'
import {
  buildNavGroups,
  buildNavItems,
  isNavItemActive,
  resolvePageTitle,
  type NavGroup,
} from './navigation'
import UserMenu from './UserMenu'

const MAIN_ID = 'main-content'

function navLinkClass(active: boolean): string {
  const base =
    'flex items-center gap-3 rounded-control border-l-[3px] px-3 py-2 text-sm font-medium transition-colors'

  return active
    ? `${base} border-accent-warm bg-white/8 text-white`
    : `${base} border-transparent text-brand-200/80 hover:bg-white/5 hover:text-white`
}

function NavLinks({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[]
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.key}>
          <p className="px-3 pb-1 pt-4 text-caption font-semibold uppercase tracking-wide text-brand-300/70 first:pt-0">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = isNavItemActive(pathname, item.href)
              const Icon = item.icon

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                  className={navLinkClass(active)}
                >
                  <Icon
                    size={20}
                    weight={active ? 'fill' : 'regular'}
                    aria-hidden="true"
                    className="shrink-0"
                  />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

function BrandMark({ action }: { action?: ReactNode }) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/10 px-5">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-control bg-brand-600 text-sm font-bold text-on-brand"
      >
        {APP_NAME.charAt(0)}
      </span>
      <span className="flex-1 truncate text-sm font-semibold text-white">
        {APP_NAME}
      </span>
      {action}
    </div>
  )
}

/**
 * Мобильный drawer — нативный `<dialog>` (тот же приём, что и в `Modal`):
 * фокус-трап, закрытие по Escape и возврат фокуса кнопке-инициатору даёт
 * браузер сам, без ручной реализации.
 */
function MobileNavDrawer({
  open,
  onClose,
  groups,
  pathname,
}: {
  open: boolean
  onClose: () => void
  groups: NavGroup[]
  pathname: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

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
      id="mobile-nav"
      aria-label="Разделы CRM"
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-72 max-w-[85vw] rounded-none border-0 bg-brand-900 p-0 backdrop:bg-zinc-900/50 lg:hidden dark:backdrop:bg-black/70"
    >
      <div className="flex h-full flex-col overflow-y-auto pb-4">
        <BrandMark
          action={
            <button
              type="button"
              aria-label="Закрыть меню"
              onClick={onClose}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-brand-200/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <XIcon size={18} aria-hidden="true" />
            </button>
          }
        />
        <nav className="flex-1 space-y-1 p-3">
          <NavLinks groups={groups} pathname={pathname} onNavigate={onClose} />
        </nav>
      </div>
    </dialog>
  )
}

/** Общий каркас защищённых страниц: навигация, шапка и область содержимого. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { user } = useSession()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const navGroups = buildNavGroups(user?.role ?? null)
  const navItems = buildNavItems(user?.role ?? null)
  const pageTitle = resolvePageTitle(pathname, navItems)
  const breadcrumb = useBreadcrumb()

  return (
    <div className="min-h-dvh bg-surface-muted">
      <a
        href={`#${MAIN_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-on-brand"
      >
        Перейти к содержимому
      </a>

      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden bg-brand-900 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
          <BrandMark />
          <nav
            aria-label="Разделы CRM"
            className="flex-1 space-y-1 overflow-y-auto p-3"
          >
            <NavLinks groups={navGroups} pathname={pathname} />
          </nav>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-zinc-200 bg-surface px-4 shadow-xs lg:px-8 dark:border-zinc-800">
            <button
              ref={menuButtonRef}
              type="button"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav"
              onClick={() => {
                setMobileNavOpen(true)
              }}
              className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 lg:hidden dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <ListIcon size={18} aria-hidden="true" />
              Меню
            </button>

            {breadcrumb ? (
              <nav
                aria-label="Хлебные крошки"
                className="min-w-0 flex-1 truncate text-body"
              >
                <Link
                  href={breadcrumb.sectionHref}
                  className="text-muted underline-offset-4 hover:text-zinc-900 hover:underline dark:hover:text-zinc-50"
                >
                  {breadcrumb.sectionLabel}
                </Link>
                <span aria-hidden="true" className="mx-1.5 text-muted">
                  /
                </span>
                <span
                  aria-current="page"
                  className="font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  {breadcrumb.itemLabel}
                </span>
              </nav>
            ) : (
              <span className="min-w-0 flex-1 truncate text-body font-semibold text-zinc-900 dark:text-zinc-50">
                {pageTitle}
              </span>
            )}

            <UserMenu />
          </header>

          <MobileNavDrawer
            open={mobileNavOpen}
            onClose={() => {
              setMobileNavOpen(false)
              menuButtonRef.current?.focus()
            }}
            groups={navGroups}
            pathname={pathname}
          />

          <main
            id={MAIN_ID}
            tabIndex={-1}
            className="flex-1 px-4 py-6 lg:px-8 lg:py-8"
          >
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default AppShell
