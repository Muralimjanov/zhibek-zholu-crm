'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePageBreadcrumb } from '@/components/layout/breadcrumb-store'
import Badge from '@/components/ui/Badge'
import ErrorState from '@/components/ui/ErrorState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useSession } from '@/features/auth/useSession'
import { canViewBookings } from '@/features/bookings/access'
import { formatArea } from '@/features/bookings/area'
import NoAccess from '@/features/bookings/components/NoAccess'
import {
  SECONDARY_BUTTON_CLASS,
  SECTION_CLASS,
  SECTION_TITLE_CLASS,
} from '@/features/bookings/components/section'
import { useManagerDisplayName } from '@/features/bookings/managerDirectory'
import {
  canConfirmDeposit,
  canEditContract,
  canManageContractFile,
  canViewContractDetail,
} from '../access'
import { describeContractError } from '../errors'
import { contractStatusTone, formatContractStatus, formatDate } from '../labels'
import { formatPercent, formatTyiynAsSom } from '../money'
import { useContractQuery } from '../queries'
import ContractFile from './ContractFile'
import DepositConfirm from './DepositConfirm'
import EditContractForm from './EditContractForm'

export function ContractDetailScreen({ id }: { id: string }) {
  const { user } = useSession()
  const canView = canViewContractDetail(user?.role)
  const { data, isPending, isError, error, refetch } = useContractQuery(
    id,
    canView,
  )
  const managerName = useManagerDisplayName(user?.role, user?.id)
  usePageBreadcrumb('Договоры', '/contracts', data?.fullName ?? null)

  const [editing, setEditing] = useState(false)

  if (!user) {
    return null
  }

  if (!canView) {
    return (
      <NoAccess reason="Карточка договора для этой роли пока недоступна. Суммы и статус доступны в списке договоров." />
    )
  }

  if (isPending) {
    return (
      <p role="status" className="text-sm text-zinc-500">
        Загружаем договор…
      </p>
    )
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <PageHeader
          eyebrow="Договоры"
          title={isError ? 'Не удалось загрузить договор' : 'Договор не найден'}
        />
        {isError ? (
          <ErrorState
            message={describeContractError(error)}
            onRetry={() => void refetch()}
          />
        ) : (
          <p role="alert" className="text-sm text-danger">
            Договор не найден или недоступен.
          </p>
        )}
      </div>
    )
  }

  const canEdit = canEditContract(user.role, data)
  const canConfirm = canConfirmDeposit(user.role) && !data.depositPaid
  const canFile = canManageContractFile(user.role)
  const canViewBooking = canViewBookings(user.role)

  const rows: [string, string][] = [
    ['ФИО покупателя', data.fullName ?? '—'],
    ['Номер паспорта', data.passportNumber ?? '—'],
    ['Телефон', data.phone ?? '—'],
    ['Почта', data.email ?? '—'],
    ['Адрес объекта', data.address ?? '—'],
    ['Площадь', formatArea(data.areaSqm)],
    ['Цена за м²', formatTyiynAsSom(data.pricePerSqmTyiyn)],
    ['Сумма договора', formatTyiynAsSom(data.totalAmountTyiyn)],
    ['Процент взноса', formatPercent(data.depositPercent)],
    [
      'Взнос',
      `${formatTyiynAsSom(data.depositAmountTyiyn)}${
        data.depositPaid
          ? ` · оплачен ${formatDate(data.depositPaidAt)}`
          : ' · не оплачен'
      }`,
    ],
    ['Ответственный менеджер', managerName(data.managerId)],
    ['Согласие покупателя', data.buyerConsentVersion ?? '—'],
    ['Создан', formatDate(data.createdAt)],
    ['Обновлён', formatDate(data.updatedAt)],
  ]

  if (editing) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader eyebrow="Договоры" title="Редактирование договора" />
        <EditContractForm
          contract={data}
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
      <PageHeader
        eyebrow="Договоры"
        title={data.fullName ?? 'Договор'}
        description={
          data.bookingId ? (
            canViewBooking ? (
              <Link
                href={`/bookings/${data.bookingId}`}
                className="font-medium text-brand-700 underline underline-offset-4 dark:text-brand-300"
              >
                Открыть исходную бронь
              </Link>
            ) : (
              'Оформлен из брони'
            )
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <section className={SECTION_CLASS} aria-labelledby="contract-heading">
            <h2 id="contract-heading" className={SECTION_TITLE_CLASS}>
              Данные договора
            </h2>
            <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                    {label}
                  </dt>
                  <dd className="mt-0.5 break-words text-sm tabular-nums text-zinc-900 dark:text-zinc-50">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section
            className={SECTION_CLASS}
            aria-labelledby="contract-file-heading"
          >
            <h2 id="contract-file-heading" className={SECTION_TITLE_CLASS}>
              Файл договора
            </h2>
            <div className="mt-4">
              <ContractFile
                contractId={data.id}
                hasFile={data.hasFile}
                canManage={canFile}
              />
            </div>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <section className={SECTION_CLASS} aria-labelledby="status-heading">
            <h2 id="status-heading" className={SECTION_TITLE_CLASS}>
              Статус
            </h2>
            <div className="mt-3">
              <Badge tone={contractStatusTone(data.status)}>
                {formatContractStatus(data.status)}
              </Badge>
            </div>
            {canEdit ? (
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

          {canConfirm ? (
            <section
              className={SECTION_CLASS}
              aria-labelledby="deposit-heading"
            >
              <h2 id="deposit-heading" className={SECTION_TITLE_CLASS}>
                Взнос
              </h2>
              <DepositConfirm
                contractId={data.id}
                depositAmountTyiyn={data.depositAmountTyiyn}
              />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default ContractDetailScreen
