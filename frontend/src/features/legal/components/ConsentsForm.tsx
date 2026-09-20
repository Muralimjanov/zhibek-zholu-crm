'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import PageLoader from '@/components/ui/PageLoader'
import { describeApiError } from '@/features/auth/error-messages'
import { checkConsents, getRequiredPolicyTypes } from '@/features/auth/session'
import { useSession } from '@/features/auth/useSession'
import { ApiError } from '@/lib/api/client'
import type { LegalDocument, LegalDocumentSummary } from '@/types/legal'
import {
  requestLegalDocument,
  requestLegalDocuments,
  submitConsent,
} from '../api'
import MarkdownText from './MarkdownText'

type LoadState = 'loading' | 'ready' | 'error'

/**
 * Локальные классы, а не общий `bookings/components/section` — этот экран
 * идёт до входа в dashboard shell (как `LoginForm`), поэтому не тянет
 * зависимость на модуль bookings, только тот же визуальный язык (бренд-CTA,
 * `rounded-control`/`rounded-card`).
 */
const primaryButtonClass =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control bg-brand-600 px-4 py-2.5 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60'
const secondaryButtonClass =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
const alertClass =
  'rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger dark:border-red-900 dark:bg-red-950'
const noticeClass =
  'rounded-control border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'

/**
 * Обязательные согласия. Список документов и их версии берутся из
 * `GET /legal/documents`. Какие из них обязательны, сообщает
 * `GET /consents/status`; если в его ответе такого списка нет, обязательными
 * считаются документы с `audience: "user"` (это поле возвращает сам API).
 */
export function ConsentsForm() {
  const router = useRouter()
  const { consent } = useSession()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<LegalDocumentSummary[]>([])
  const [accepted, setAccepted] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [texts, setTexts] = useState<Record<string, LegalDocument>>({})
  const [textErrors, setTextErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const loadDocuments = useCallback(async () => {
    setLoadState('loading')
    setLoadError(null)

    try {
      const list = await requestLegalDocuments()

      setDocuments(list)
      setAccepted({})
      setTexts({})
      setLoadState('ready')
    } catch (error) {
      setLoadError(describeApiError(error))
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    if (consent === 'granted') {
      router.replace('/dashboard')
    }
  }, [consent, router])

  const requiredTypes =
    getRequiredPolicyTypes() ??
    documents
      .filter((document) => document.audience === 'user')
      .map((document) => document.type)

  const requiredDocuments = documents.filter((document) =>
    requiredTypes.includes(document.type),
  )
  const otherDocuments = documents.filter(
    (document) => !requiredTypes.includes(document.type),
  )
  const missingTypes = requiredTypes.filter(
    (type) => !documents.some((document) => document.type === type),
  )

  const allAccepted =
    requiredDocuments.length > 0 &&
    requiredDocuments.every((document) => accepted[document.type])

  const toggleDocument = async (type: string) => {
    const next = expanded === type ? null : type

    setExpanded(next)

    if (next === null || texts[type] || textErrors[type]) {
      return
    }

    try {
      const document = await requestLegalDocument(type)

      setTexts((current) => ({ ...current, [type]: document }))
    } catch (error) {
      setTextErrors((current) => ({
        ...current,
        [type]: describeApiError(error),
      }))
    }
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)
    setSubmitting(true)

    try {
      for (const document of requiredDocuments) {
        await submitConsent({
          policyType: document.type,
          policyVersion: document.version,
        })
      }

      const granted = await checkConsents()

      if (granted) {
        router.replace('/dashboard')

        return
      }

      setSubmitError(
        'Сервер всё ещё считает, что приняты не все обязательные документы.',
      )
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setSubmitError(
          'Версии документов обновились. Перечитайте документы и подтвердите заново.',
        )
        await loadDocuments()
      } else {
        setSubmitError(describeApiError(error))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loadState === 'loading') {
    return <PageLoader label="Загружаем документы…" />
  }

  if (loadState === 'error') {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Не удалось загрузить документы
        </h1>
        <p role="alert" className={`mt-4 ${alertClass}`}>
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => void loadDocuments()}
          className={`mt-4 ${secondaryButtonClass}`}
        >
          Повторить
        </button>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Подтверждение документов
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Чтобы продолжить работу в CRM, прочитайте и подтвердите обязательные
        документы.
      </p>

      {missingTypes.length > 0 ? (
        <p role="alert" className={`mt-4 ${noticeClass}`}>
          Сервер требует документы, которых нет в списке:{' '}
          {missingTypes.join(', ')}. Сообщите об этом backend-команде.
        </p>
      ) : null}

      <form className="mt-8 space-y-4" onSubmit={onSubmit}>
        {requiredDocuments.map((document) => (
          <section
            key={document.type}
            className="rounded-card border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex items-start gap-3">
              <input
                id={`consent-${document.type}`}
                type="checkbox"
                checked={accepted[document.type] ?? false}
                onChange={(event) => {
                  const { checked } = event.target

                  setAccepted((current) => ({
                    ...current,
                    [document.type]: checked,
                  }))
                }}
                className="mt-1 size-4"
              />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={`consent-${document.type}`}
                  className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
                >
                  {document.title}
                </label>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Версия {document.version}
                  {document.draft ? ' · черновик' : ''}
                </p>
                <button
                  type="button"
                  aria-expanded={expanded === document.type}
                  onClick={() => void toggleDocument(document.type)}
                  className="mt-2 cursor-pointer text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
                >
                  {expanded === document.type
                    ? 'Скрыть текст'
                    : 'Показать текст'}
                </button>

                {expanded === document.type ? (
                  <div className="mt-3 max-h-80 overflow-y-auto rounded-control bg-surface-muted p-3">
                    {textErrors[document.type] ? (
                      <p className="text-sm text-danger">
                        {textErrors[document.type]}
                      </p>
                    ) : texts[document.type] ? (
                      <MarkdownText content={texts[document.type].content} />
                    ) : (
                      <p className="text-sm text-zinc-500">Загружаем текст…</p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ))}

        {submitError ? (
          <p role="alert" className={alertClass}>
            {submitError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!allAccepted || submitting}
          className={primaryButtonClass}
        >
          {submitting ? 'Отправляем…' : 'Подтвердить и продолжить'}
        </button>
      </form>

      {otherDocuments.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Остальные документы
          </h2>
          <ul className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {otherDocuments.map((document) => (
              <li key={document.type}>
                {document.title} — версия {document.version}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}

export default ConsentsForm
