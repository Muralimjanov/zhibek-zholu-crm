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
import NoAccess from '@/features/bookings/components/NoAccess'
import {
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'
import { useCreateFlagFromQuery } from '@/hooks/useCreateFlagFromQuery'
import type { ContractListQuery, ContractStatusFilter } from '@/types/contract'
import {
  canSearchContracts,
  canViewContracts,
  isAccountantView,
} from '../access'
import { describeContractError } from '../errors'
import { formatContractStatus } from '../labels'
import { useContractsQuery } from '../queries'
import AccountantContractsTable from './AccountantContractsTable'
import ContractsFilters, { type SearchField } from './ContractsFilters'
import ContractsTable from './ContractsTable'
import CreateContractForm from './CreateContractForm'

const PAGE_SIZE = 20

interface AppliedFilters {
  status?: ContractStatusFilter
  phone?: string
  passportNumber?: string
}

const ACCOUNTANT_COLUMNS = [
  'Статус',
  'Площадь',
  'Сумма',
  'Процент взноса',
  'Взнос',
  'Файл',
  'Создан',
  '',
]

const FULL_COLUMNS = [
  'ФИО покупателя',
  'Статус',
  'Площадь',
  'Сумма',
  'Взнос',
  'Файл',
  'Менеджер',
  'Создан',
  '',
]

export function ContractsScreen() {
  const { user } = useSession()

  const [status, setStatus] = useState<ContractStatusFilter | ''>('')
  const [searchField, setSearchField] = useState<SearchField>('phone')
  const [searchValue, setSearchValue] = useState('')
  const [applied, setApplied] = useState<AppliedFilters>({})
  const [offset, setOffset] = useState(0)
  const [creating, setCreating] = useCreateFlagFromQuery()

  const query = useMemo<ContractListQuery>(
    () => ({ ...applied, limit: PAGE_SIZE, offset }),
    [applied, offset],
  )

  const canView = canViewContracts(user?.role)
  const accountantView = isAccountantView(user?.role)
  const canSearch = canSearchContracts(user?.role)
  const { data, isPending, isError, error, refetch, isFetching } =
    useContractsQuery(query, canView)

  if (!user) {
    return null
  }

  if (!canView) {
    return (
      <NoAccess reason="Договоры доступны директору, начальнику отдела продаж, менеджерам и бухгалтеру. Если доступ нужен по работе, обратитесь к руководителю." />
    )
  }

  /**
   * Значение поиска живёт только в состоянии компонента: паспорт не должен
   * попадать в адресную строку.
   */
  const applyFilters = (nextStatus: ContractStatusFilter | '') => {
    const trimmed = searchValue.trim()

    setApplied({
      status: nextStatus === '' ? undefined : nextStatus,
      phone:
        canSearch && searchField === 'phone' && trimmed !== ''
          ? trimmed
          : undefined,
      passportNumber:
        canSearch && searchField === 'passportNumber' && trimmed !== ''
          ? trimmed
          : undefined,
    })
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
      label: `Статус: ${formatContractStatus(applied.status)}`,
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

  if (creating && !accountantView) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader
          eyebrow="Договоры"
          title="Новый договор"
          description="Данные покупателя, объект и условия — после создания их можно изменить в карточке договора."
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
        <CreateContractForm
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
        title="Договоры"
        description={
          accountantView
            ? 'Финансовое представление: без ФИО, паспорта и адреса покупателя.'
            : 'Список договоров, доступный вашей роли.'
        }
        action={
          accountantView ? undefined : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={PRIMARY_BUTTON_CLASS}
            >
              Новый договор
            </button>
          )
        }
      />

      <FilterBar>
        {canSearch ? (
          <ContractsFilters
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
        ) : (
          // Бухгалтеру точный поиск по паспорту/телефону недоступен
          // (`GET /contracts?passportNumber=...` → 403 под demo_accountant).
          <div className="space-y-1.5">
            <label htmlFor="contract-status-filter" className={LABEL_CLASS}>
              Статус
            </label>
            <select
              id="contract-status-filter"
              value={status}
              disabled={isPending && !data}
              onChange={(event) => {
                const value = event.target.value as ContractStatusFilter | ''

                setStatus(value)
                applyFilters(value)
              }}
              className={`${FIELD_CLASS} max-w-xs`}
            >
              <option value="">Любой</option>
              <option value="draft">Черновик</option>
              <option value="deposit_paid">Взнос оплачен</option>
              <option value="signed">Подписан</option>
            </select>
          </div>
        )}
      </FilterBar>

      {isPending && !data ? (
        <TableSkeleton
          caption="Загружаем список договоров"
          columns={accountantView ? ACCOUNTANT_COLUMNS : FULL_COLUMNS}
          minWidthClassName={accountantView ? 'min-w-[50rem]' : 'min-w-[58rem]'}
        />
      ) : isError ? (
        <ErrorState
          message={describeContractError(error)}
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
                  : 'Договоров пока нет'
              }
              description={
                hasAnyFilter
                  ? 'Поиск точный — проверьте значение целиком, либо уберите часть фильтров.'
                  : accountantView
                    ? 'Договоры появятся здесь после оформления.'
                    : 'Создайте первый кнопкой «Новый договор» или оформите его из активной брони.'
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
                ) : accountantView ? undefined : (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className={PRIMARY_BUTTON_CLASS}
                  >
                    Новый договор
                  </button>
                )
              }
            />
          ) : (
            <>
              {accountantView ? (
                <AccountantContractsTable items={data.items} />
              ) : (
                <ContractsTable items={data.items} />
              )}

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

export default ContractsScreen
