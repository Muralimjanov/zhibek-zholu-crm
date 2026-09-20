'use client'

import { useMemo, useState } from 'react'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import FilterBar from '@/components/ui/FilterBar'
import {
  FilterSummary,
  type ActiveFilterChip,
} from '@/components/ui/FilterSummary'
import { PageHeader } from '@/components/ui/PageHeader'
import TableSkeleton from '@/components/ui/TableSkeleton'
import { useSession } from '@/features/auth/useSession'
import { useCreateFlagFromQuery } from '@/hooks/useCreateFlagFromQuery'
import type { BookingListQuery, BookingStatusFilter } from '@/types/booking'
import { canViewBookings } from '../access'
import { describeBookingError } from '../errors'
import { formatBookingStatus } from '../labels'
import { useBookingsQuery } from '../queries'
import BookingsFilters, { type SearchField } from './BookingsFilters'
import BookingsTable from './BookingsTable'
import CreateBookingForm from './CreateBookingForm'
import NoAccess from './NoAccess'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './section'

const PAGE_SIZE = 20

interface AppliedFilters {
  status?: BookingStatusFilter
  phone?: string
  passportNumber?: string
}

export function BookingsScreen() {
  const { user } = useSession()

  const [status, setStatus] = useState<BookingStatusFilter | ''>('')
  const [searchField, setSearchField] = useState<SearchField>('phone')
  const [searchValue, setSearchValue] = useState('')
  const [applied, setApplied] = useState<AppliedFilters>({})
  const [offset, setOffset] = useState(0)
  const [creating, setCreating] = useCreateFlagFromQuery()

  const query = useMemo<BookingListQuery>(
    () => ({ ...applied, limit: PAGE_SIZE, offset }),
    [applied, offset],
  )

  const canView = canViewBookings(user?.role)
  const { data, isPending, isError, error, refetch, isFetching } =
    useBookingsQuery(query, canView)

  if (!user) {
    return null
  }

  if (!canView) {
    return <NoAccess />
  }

  /**
   * Значение поиска живёт только в состоянии компонента: номер паспорта не
   * должен попадать в адресную строку.
   */
  const applyFilters = (nextStatus: BookingStatusFilter | '') => {
    const trimmed = searchValue.trim()

    setApplied({
      status: nextStatus === '' ? undefined : nextStatus,
      phone: searchField === 'phone' && trimmed !== '' ? trimmed : undefined,
      passportNumber:
        searchField === 'passportNumber' && trimmed !== ''
          ? trimmed
          : undefined,
    })
    // Смена фильтра всегда возвращает на первую страницу.
    setOffset(0)
  }

  const resetFilters = () => {
    setStatus('')
    setSearchValue('')
    setApplied({})
    setOffset(0)
  }

  const removeStatusFilter = () => {
    setStatus('')
    setApplied((prev) => ({ ...prev, status: undefined }))
    setOffset(0)
  }

  const removeSearchFilter = () => {
    setSearchValue('')
    setApplied((prev) => ({
      ...prev,
      phone: undefined,
      passportNumber: undefined,
    }))
    setOffset(0)
  }

  const hasActiveSearch = Boolean(applied.phone ?? applied.passportNumber)
  const hasAnyFilter = hasActiveSearch || applied.status !== undefined
  const total = data?.total ?? 0
  const shownFrom = total === 0 ? 0 : offset + 1
  const shownTo = Math.min(offset + (data?.items.length ?? 0), total)

  const chips: ActiveFilterChip[] = []

  if (applied.status) {
    chips.push({
      key: 'status',
      label: `Статус: ${formatBookingStatus(applied.status)}`,
      onRemove: removeStatusFilter,
    })
  }

  if (applied.phone) {
    chips.push({
      key: 'phone',
      label: `Телефон: ${applied.phone}`,
      onRemove: removeSearchFilter,
    })
  }

  if (applied.passportNumber) {
    chips.push({
      key: 'passport',
      label: `Паспорт: ${applied.passportNumber}`,
      onRemove: removeSearchFilter,
    })
  }

  if (creating) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader
          eyebrow="Бронирования"
          title="Новая бронь"
          description="Данные покупателя и площадь — после создания их можно изменить в карточке брони."
          action={
            <button
              type="button"
              onClick={() => setCreating(false)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Отмена
            </button>
          }
        />
        <CreateBookingForm
          currentUser={user}
          onCancel={() => setCreating(false)}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Операции"
        title="Бронирования"
        description="Список бронирований, доступный вашей роли."
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={PRIMARY_BUTTON_CLASS}
          >
            Новая бронь
          </button>
        }
      />

      <FilterBar>
        <BookingsFilters
          status={status}
          onStatusChange={(value) => {
            setStatus(value)
            applyFilters(value)
          }}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          searchValue={searchValue}
          onSearchValueChange={setSearchValue}
          onSubmit={() => {
            applyFilters(status)
          }}
          onReset={resetFilters}
          disabled={isPending && !data}
          hasActiveSearch={hasActiveSearch}
        />
      </FilterBar>

      {isPending && !data ? (
        <TableSkeleton
          caption="Загружаем список бронирований"
          columns={[
            'ФИО покупателя',
            'Статус',
            'Площадь',
            'Паспорт',
            'Телефон',
            'Менеджер',
            'Создана',
            '',
          ]}
        />
      ) : isError ? (
        <ErrorState
          message={describeBookingError(error)}
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <FilterSummary
            resultsText={
              <span className="inline-flex items-center gap-3">
                <span>
                  {isFetching
                    ? 'Обновляем…'
                    : `Показаны ${shownFrom}–${shownTo} из ${total}`}
                </span>
                <button
                  type="button"
                  disabled={isFetching}
                  onClick={() => void refetch()}
                  className="cursor-pointer font-medium text-brand-700 underline underline-offset-4 disabled:opacity-60 dark:text-brand-300"
                >
                  Обновить
                </button>
              </span>
            }
            chips={chips}
          />

          {!data || data.items.length === 0 ? (
            <EmptyState
              title={
                hasAnyFilter
                  ? 'По этим условиям ничего не найдено'
                  : 'Бронирований пока нет'
              }
              description={
                hasAnyFilter
                  ? 'Поиск точный — проверьте значение целиком, либо уберите часть фильтров.'
                  : 'Создайте первую бронь, чтобы закрепить объект за клиентом.'
              }
              action={
                hasAnyFilter ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className={SECONDARY_BUTTON_CLASS}
                  >
                    Сбросить фильтры
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className={PRIMARY_BUTTON_CLASS}
                  >
                    Новая бронь
                  </button>
                )
              }
            />
          ) : (
            <>
              <BookingsTable items={data.items} />

              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={offset === 0 || isFetching}
                  onClick={() => {
                    setOffset((value) => Math.max(0, value - PAGE_SIZE))
                  }}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  Назад
                </button>
                <button
                  type="button"
                  disabled={shownTo >= total || isFetching}
                  onClick={() => {
                    setOffset((value) => value + PAGE_SIZE)
                  }}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  Вперёд
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default BookingsScreen
