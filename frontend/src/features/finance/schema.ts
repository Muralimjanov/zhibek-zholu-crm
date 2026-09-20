import { z } from 'zod'
import { somToTyiyn } from '@/features/contracts/money'
import { DATE_ONLY_PATTERN } from '@/features/shifts/date'

/**
 * `amountTyiyn` в схеме — `/^[1-9]\d{0,15}$/`: положительное целое, ноль не
 * допускается (в отличие от `contracts/money.ts#TYIYN_PATTERN`, где "0"
 * валиден). Проверяем после конвертации из сом.
 */
function isPositiveAmountInput(value: string): boolean {
  const tyiyn = somToTyiyn(value)

  return tyiyn !== null && tyiyn !== '0'
}

const amountField = z
  .string()
  .refine(
    isPositiveAmountInput,
    'Сумма: положительное число в сомах, например 1500',
  )

const dateField = z
  .string()
  .refine((value) => DATE_ONLY_PATTERN.test(value), 'Дата в формате ГГГГ-ММ-ДД')

const subcategoryField = z.string().max(100, 'Не длиннее 100 символов')

const commentField = z.string().max(1000, 'Не длиннее 1000 символов')

/**
 * `relatedContractId` в этих схемах нет — свободный текстовый ввод UUID
 * убран из создания и правки (нет подборщика договора, риск опечатки);
 * существующая связь у записи не показывается и не меняется формой.
 */
export const createTransactionSchema = z.object({
  type: z.enum(['income', 'expense']),
  category: z.string().min(1, 'Выберите категорию'),
  amount: amountField,
  date: dateField,
  subcategory: subcategoryField,
  comment: commentField,
})

export type CreateTransactionFormValues = z.infer<
  typeof createTransactionSchema
>

/** Пусто в nullable-поле — явная очистка (`null`), не «не менять» (это решает вызывающий код). */
export const editTransactionSchema = z.object({
  amount: amountField,
  date: dateField,
  subcategory: subcategoryField,
  comment: commentField,
})

export type EditTransactionFormValues = z.infer<typeof editTransactionSchema>
