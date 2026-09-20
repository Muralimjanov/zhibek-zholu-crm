import type { TransactionCategory, TransactionType } from '@/types/finance'

/**
 * Категория → тип и подпись. Подтверждено живьём через
 * `GET /accounting/summary.byCategory` (`FINANCE_API_EXAMPLES.md`) — сервер
 * прислал все 14 категорий с привязкой к `type` и человекочитаемым `label`,
 * это не предположение по названию enum.
 */
export const CATEGORY_INFO: Record<
  TransactionCategory,
  { type: TransactionType; label: string }
> = {
  sale_deposit: { type: 'income', label: 'Взносы по договорам' },
  sale_full_payment: { type: 'income', label: 'Полная оплата по договорам' },
  sale_installment: { type: 'income', label: 'Платежи по рассрочке' },
  other_income: { type: 'income', label: 'Прочие поступления' },
  construction_materials: {
    type: 'expense',
    label: 'Строительные материалы',
  },
  contractor_payment: {
    type: 'expense',
    label: 'Оплата подрядчикам и субподрядчикам',
  },
  payroll: { type: 'expense', label: 'Зарплата и налоги сотрудников' },
  equipment_rent: { type: 'expense', label: 'Аренда техники и оборудования' },
  utilities: { type: 'expense', label: 'Коммунальные расходы объекта' },
  marketing: { type: 'expense', label: 'Маркетинг и реклама' },
  legal_notary: {
    type: 'expense',
    label: 'Юридические и нотариальные расходы',
  },
  taxes_corporate: {
    type: 'expense',
    label: 'Корпоративные налоги и обязательные платежи',
  },
  admin_office: {
    type: 'expense',
    label: 'Административные и офисные расходы',
  },
  other_expense: { type: 'expense', label: 'Непредвиденные расходы' },
}

export const ALL_CATEGORIES = Object.keys(
  CATEGORY_INFO,
) as TransactionCategory[]

/**
 * Все категории выбранного типа доступны бухгалтеру для ручного создания.
 * Подтверждено описанием тега `accounting` в опубликованной схеме API
 * 0.3.0: «Бэкенд не создаёт операции автоматически: отметка взноса по
 * договору и подтверждение зарплаты не порождают записей» — включая
 * `sale_deposit`/`sale_full_payment`/`sale_installment`/`payroll`, ранее
 * скрытые здесь как предположительно автосоздаваемые.
 */
export function categoriesForType(
  type: TransactionType,
): TransactionCategory[] {
  return ALL_CATEGORIES.filter(
    (category) => CATEGORY_INFO[category].type === type,
  )
}

/**
 * Категория принадлежит выбранному типу. Принимает произвольную строку (не
 * только `TransactionCategory`) — сама и есть проверка, что значение из
 * формы (могло остаться от другого типа после смены `type` в обход сброса)
 * действительно подходит, прежде чем уйти в API.
 */
export function isCategoryValidForType(
  type: TransactionType,
  category: string,
): boolean {
  return CATEGORY_INFO[category as TransactionCategory]?.type === type
}
