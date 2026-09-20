'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { PRIVACY_POLICY_TEXT, TERMS_OF_USE_TEXT } from '../policyContent'

const linkClass =
  'cursor-pointer text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'

/** Ссылки-кнопки под карточкой входа + модалки с текстом — без выхода за пределы этого экрана. */
export function PolicyFooter() {
  const [open, setOpen] = useState<'terms' | 'privacy' | null>(null)

  return (
    <>
      <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-500">
        Продолжая, вы принимаете{' '}
        <button
          type="button"
          className={linkClass}
          onClick={() => setOpen('terms')}
        >
          условия использования
        </button>{' '}
        и{' '}
        <button
          type="button"
          className={linkClass}
          onClick={() => setOpen('privacy')}
        >
          политику конфиденциальности
        </button>
        .
      </p>

      <Modal
        open={open === 'terms'}
        onClose={() => setOpen(null)}
        title="Условия использования"
      >
        {TERMS_OF_USE_TEXT.map((paragraph, i) => (
          <p key={i} className={i > 0 ? 'mt-3' : undefined}>
            {paragraph}
          </p>
        ))}
      </Modal>

      <Modal
        open={open === 'privacy'}
        onClose={() => setOpen(null)}
        title="Политика конфиденциальности"
      >
        {PRIVACY_POLICY_TEXT.map((paragraph, i) => (
          <p key={i} className={i > 0 ? 'mt-3' : undefined}>
            {paragraph}
          </p>
        ))}
      </Modal>
    </>
  )
}

export default PolicyFooter
