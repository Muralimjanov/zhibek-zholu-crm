'use client'

import { useId, type FormEvent } from 'react'
import type { ContractStatusFilter } from '@/types/contract'
import {
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'

export type SearchField = 'phone' | 'passportNumber'

interface ContractsFiltersProps {
  status: ContractStatusFilter | ''
  onStatusChange: (value: ContractStatusFilter | '') => void
  searchField: SearchField
  onSearchFieldChange: (value: SearchField) => void
  searchValue: string
  onSearchValueChange: (value: string) => void
  onSubmit: () => void
  onReset: () => void
  disabled: boolean
  hasActiveSearch: boolean
}

export function ContractsFilters({
  status,
  onStatusChange,
  searchField,
  onSearchFieldChange,
  searchValue,
  onSearchValueChange,
  onSubmit,
  onReset,
  disabled,
  hasActiveSearch,
}: ContractsFiltersProps) {
  const statusId = useId()
  const fieldId = useId()
  const valueId = useId()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={handleSubmit}
      role="search"
      aria-label="Фильтры договоров"
    >
      <div className="space-y-1.5">
        <label htmlFor={statusId} className={LABEL_CLASS}>
          Статус
        </label>
        <select
          id={statusId}
          value={status}
          disabled={disabled}
          onChange={(event) => {
            onStatusChange(event.target.value as ContractStatusFilter | '')
          }}
          className={FIELD_CLASS}
        >
          <option value="">Любой</option>
          <option value="draft">Черновик</option>
          <option value="deposit_paid">Взнос оплачен</option>
          <option value="signed">Подписан</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={fieldId} className={LABEL_CLASS}>
          Искать по
        </label>
        <select
          id={fieldId}
          value={searchField}
          disabled={disabled}
          onChange={(event) => {
            onSearchFieldChange(event.target.value as SearchField)
          }}
          className={FIELD_CLASS}
        >
          <option value="phone">Телефону</option>
          <option value="passportNumber">Паспорту</option>
        </select>
      </div>

      <div className="min-w-56 flex-1 space-y-1.5">
        <label htmlFor={valueId} className={LABEL_CLASS}>
          Значение
        </label>
        <input
          id={valueId}
          type="text"
          value={searchValue}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) => {
            onSearchValueChange(event.target.value)
          }}
          aria-describedby={`${valueId}-hint`}
          className={FIELD_CLASS}
        />
        <p
          id={`${valueId}-hint`}
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          Поиск точный, его выполняет сервер. Регистр и пробелы значения не
          имеют.
        </p>
      </div>

      <div className="flex gap-2.5">
        <button
          type="submit"
          disabled={disabled}
          className={PRIMARY_BUTTON_CLASS}
        >
          Найти
        </button>
        {hasActiveSearch || status !== '' ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onReset}
            className={SECONDARY_BUTTON_CLASS}
          >
            Сбросить
          </button>
        ) : null}
      </div>
    </form>
  )
}

export default ContractsFilters
