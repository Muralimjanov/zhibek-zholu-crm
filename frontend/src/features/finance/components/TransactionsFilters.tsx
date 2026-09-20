'use client'

import { useId } from 'react'
import {
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/features/bookings/components/section'
import type { TransactionType } from '@/types/finance'
import { categoriesForType } from '../categories'
import { formatCategory } from '../labels'

export function TransactionsFilters({
  from,
  to,
  type,
  category,
  onFromChange,
  onToChange,
  onTypeChange,
  onCategoryChange,
  onSubmit,
  onReset,
  disabled,
}: {
  from: string
  to: string
  type: TransactionType | ''
  category: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  onTypeChange: (value: TransactionType | '') => void
  onCategoryChange: (value: string) => void
  onSubmit: () => void
  onReset: () => void
  disabled: boolean
}) {
  const fromId = useId()
  const toId = useId()
  const typeId = useId()
  const categoryId = useId()

  const categoryOptions = type ? categoriesForType(type) : []

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor={fromId} className={LABEL_CLASS}>
          С даты
        </label>
        <input
          id={fromId}
          type="date"
          disabled={disabled}
          value={from}
          onChange={(event) => {
            onFromChange(event.target.value)
          }}
          className={FIELD_CLASS}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={toId} className={LABEL_CLASS}>
          По дату
        </label>
        <input
          id={toId}
          type="date"
          disabled={disabled}
          value={to}
          onChange={(event) => {
            onToChange(event.target.value)
          }}
          className={FIELD_CLASS}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={typeId} className={LABEL_CLASS}>
          Тип
        </label>
        <select
          id={typeId}
          disabled={disabled}
          value={type}
          onChange={(event) => {
            onTypeChange(event.target.value as TransactionType | '')
            // Категория зависит от типа — при смене типа фильтр по категории сбрасываем.
            onCategoryChange('')
          }}
          className={FIELD_CLASS}
        >
          <option value="">Любой</option>
          <option value="income">Приход</option>
          <option value="expense">Расход</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={categoryId} className={LABEL_CLASS}>
          Категория
        </label>
        <select
          id={categoryId}
          disabled={disabled || !type}
          value={category}
          onChange={(event) => {
            onCategoryChange(event.target.value)
          }}
          className={FIELD_CLASS}
        >
          <option value="">Любая</option>
          {categoryOptions.map((option) => (
            <option key={option} value={option}>
              {formatCategory(option)}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={disabled}
        className={PRIMARY_BUTTON_CLASS}
      >
        Применить
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onReset}
        className={SECONDARY_BUTTON_CLASS}
      >
        Сбросить
      </button>
    </form>
  )
}

export default TransactionsFilters
