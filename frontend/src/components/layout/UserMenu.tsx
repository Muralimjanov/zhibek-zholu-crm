'use client'

import {
  CaretDownIcon,
  SignOutIcon,
  UserCircleIcon,
} from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { formatRole } from '@/features/auth/labels'
import { logout } from '@/features/auth/session'
import { useSession } from '@/features/auth/useSession'
import UserAvatar from '@/features/profile/components/UserAvatar'

export function UserMenu() {
  const { user, avatarVersion } = useSession()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!user) {
    return null
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="user-menu-popover"
        onClick={() => {
          setOpen((value) => !value)
        }}
        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <UserAvatar user={user} version={avatarVersion} />
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {user.fullName}
          </span>
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
            {formatRole(user.role)}
          </span>
        </span>
        <CaretDownIcon
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div
          id="user-menu-popover"
          className="absolute right-0 z-30 mt-2 w-60 rounded-lg border border-zinc-200 bg-surface p-1.5 shadow-lg dark:border-zinc-800"
        >
          <div className="border-b border-zinc-200 px-2.5 pb-2.5 pt-1.5 sm:hidden dark:border-zinc-800">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {user.fullName}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {formatRole(user.role)}
            </p>
          </div>

          <Link
            href="/profile"
            onClick={() => {
              setOpen(false)
            }}
            className="mt-1 flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <UserCircleIcon size={18} aria-hidden="true" className="shrink-0" />
            Профиль
          </Link>

          <div className="my-1.5 border-t border-zinc-200 dark:border-zinc-800" />

          <button
            type="button"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true)
              void logout().finally(() => {
                setSigningOut(false)
              })
            }}
            className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <SignOutIcon size={18} aria-hidden="true" className="shrink-0" />
            {signingOut ? 'Выходим…' : 'Выйти'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default UserMenu
