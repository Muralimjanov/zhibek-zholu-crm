'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePageBreadcrumb } from '@/components/layout/breadcrumb-store'
import Badge from '@/components/ui/Badge'
import ErrorState from '@/components/ui/ErrorState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useSession } from '@/features/auth/useSession'
import { canViewBookings } from '../access'
import { formatArea } from '../area'
import { describeBookingError } from '../errors'
import { bookingStatusTone, formatBookingStatus, formatDate } from '../labels'
import ConvertBookingForm from '@/features/contracts/components/ConvertBookingForm'
import { useManagerDisplayName } from '../managerDirectory'
import { useBookingQuery, useUpdateBooking } from '../queries'
import EditBookingForm from './EditBookingForm'
import NoAccess from './NoAccess'
import {
  ALERT_CLASS,
  DANGER_BUTTON_CLASS,
  NOTICE_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from './section'

export function BookingDetailScreen({ id }: { id: string }) {
  const { user } = useSession()
  const canView = canViewBookings(user?.role)
  const { data, isPending, isError, error, refetch } = useBookingQuery(
    id,
    canView,
  )
  const managerName = useManagerDisplayName(user?.role, user?.id)
  usePageBreadcrumb('Бронирования', '/bookings', data?.fullName ?? null)

  const [editing, setEditing] = useState(false)
  const [askCancel, setAskCancel] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [converting, setConverting] = useState(false)
  const cancelMutation = useUpdateBooking(id)

  if (!user) {
    return null
  }

  if (!canView) {
    return <NoAccess />
  }

  if (isPending) {
    return (
      <p role="status" className="text-sm text-zinc-500">
        Загружаем бронь…
      </p>
    )
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <PageHeader
          eyebrow="Бронирования"
          title={isError ? 'Не удалось загрузить бронь' : 'Бронь не найдена'}
        />
        {isError ? (
          <ErrorState
            message={describeBookingError(error)}
            onRetry={() => void refetch()}
          />
        ) : (
          <p role="alert" className={ALERT_CLASS}>
            Бронь не найдена или недоступна.
          </p>
        )}
        <Link href="/bookings" className={SECONDARY_BUTTON_CLASS}>
          К списку
        </Link>
      </div>
    )
  }

  const isActive = data.status === 'active'

  const rows: [string, string][] = [
    ['ФИО покупателя', data.fullName ?? '—'],
    ['Номер паспорта', data.passportNumber ?? '—'],
    ['Телефон', data.phone ?? '—'],
    ['Почта', data.email ?? '—'],
    ['Желаемая площадь', formatArea(data.desiredAreaSqm)],
    ['Ответственный менеджер', managerName(data.managerId)],
    [
      'Согласие покупателя',
      data.buyerConsentVersion
        ? `версия ${data.buyerConsentVersion} от ${formatDate(data.buyerConsentConfirmedAt)}`
        : '—',
    ],
    ['Создана', formatDate(data.createdAt)],
    ['Обновлена', formatDate(data.updatedAt)],
  ]

  const handleCancel = async () => {
    setCancelError(null)

    try {
      await cancelMutation.mutateAsync({ status: 'cancelled' })
      setAskCancel(false)
      setCancelled(true)
    } catch (mutationError) {
      setCancelError(describeBookingError(mutationError))
    }
  }

  if (editing) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader eyebrow="Бронирования" title="Редактирование брони" />
        <EditBookingForm
          booking={data}
          role={user.role}
          currentUserId={user.id}
          onDone={() => {
            setEditing(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader eyebrow="Бронирования" title={data.fullName ?? 'Бронь'} />

      {cancelled ? (
        <p role="status" className={NOTICE_CLASS}>
          Бронь отменена.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <section
          className={`${SECTION_CLASS} lg:col-span-8`}
          aria-labelledby="booking-heading"
        >
          <h2 id="booking-heading" className={SECTION_TITLE_CLASS}>
            Данные брони
          </h2>

          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  {label}
                </dt>
                <dd className="mt-0.5 break-words text-sm text-zinc-900 dark:text-zinc-50">
                  {value}
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                Договор
              </dt>
              <dd className="mt-0.5 break-words text-sm text-zinc-900 dark:text-zinc-50">
                {data.contractId ? (
                  <Link
                    href={`/contracts/${data.contractId}`}
                    className="font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
                  >
                    Открыть договор
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>

          <p className="mt-5 text-xs text-zinc-500 dark:text-zinc-400">
            Здесь номер паспорта показан полностью. Просмотр карточки сервер
            записывает в журнал.
          </p>
        </section>

        <div className="space-y-6 lg:col-span-4">
          <section className={SECTION_CLASS} aria-labelledby="status-heading">
            <h2 id="status-heading" className={SECTION_TITLE_CLASS}>
              Статус
            </h2>
            <div className="mt-3">
              <Badge tone={bookingStatusTone(data.status)}>
                {formatBookingStatus(data.status)}
              </Badge>
            </div>
            {isActive ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(true)
                }}
                className={`mt-4 ${SECONDARY_BUTTON_CLASS}`}
              >
                Редактировать
              </button>
            ) : null}
          </section>

          {isActive && !data.contractId ? (
            converting ? (
              <ConvertBookingForm
                bookingId={id}
                onDone={() => {
                  setConverting(false)
                }}
              />
            ) : (
              <section
                className={SECTION_CLASS}
                aria-labelledby="convert-heading"
              >
                <h2 id="convert-heading" className={SECTION_TITLE_CLASS}>
                  Договор
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Бронь ещё не переведена в договор.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setConverting(true)
                  }}
                  className={`mt-4 ${SECONDARY_BUTTON_CLASS}`}
                >
                  Оформить в договор
                </button>
              </section>
            )
          ) : null}

          {isActive ? (
            <section className={SECTION_CLASS} aria-labelledby="cancel-heading">
              <h2 id="cancel-heading" className={SECTION_TITLE_CLASS}>
                Отмена брони
              </h2>

              {askCancel ? (
                <div className="mt-4 rounded-control border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
                  <p className="text-sm text-amber-900 dark:text-amber-200">
                    Отменить эту бронь? Обратный переход в активную в API не
                    описан, поэтому считайте действие необратимым.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      disabled={cancelMutation.isPending}
                      onClick={() => void handleCancel()}
                      className={DANGER_BUTTON_CLASS}
                    >
                      {cancelMutation.isPending
                        ? 'Отменяем…'
                        : 'Да, отменить бронь'}
                    </button>
                    <button
                      type="button"
                      disabled={cancelMutation.isPending}
                      onClick={() => {
                        setAskCancel(false)
                      }}
                      className={SECONDARY_BUTTON_CLASS}
                    >
                      Не отменять
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAskCancel(true)
                  }}
                  className={`mt-4 ${SECONDARY_BUTTON_CLASS}`}
                >
                  Отменить бронь
                </button>
              )}

              {cancelError ? (
                <p role="alert" className={`mt-3 ${ALERT_CLASS}`}>
                  {cancelError}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default BookingDetailScreen
