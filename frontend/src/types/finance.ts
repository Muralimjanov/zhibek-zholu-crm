/**
 * Типы бухгалтерии. Тела ответов `GET /transactions`, `GET /transactions/{id}`
 * и `GET /accounting/summary` в OpenAPI 0.2.0 не описаны — форма подтверждена
 * фактическими ответами тестового бухгалтера и директора, зафиксированными в
 * `FINANCE_API_EXAMPLES.md`. Разбор — в `src/features/finance/parse.ts`,
 * который не доверяет этим типам вслепую.
 */

export type TransactionType = 'income' | 'expense'

/** Полный enum из OpenAPI (`CreateTransactionDto.category`), состав категорий подтверждён живьём через `GET /accounting/summary.byCategory`. */
export type TransactionCategory =
  | 'sale_deposit'
  | 'sale_full_payment'
  | 'sale_installment'
  | 'other_income'
  | 'construction_materials'
  | 'contractor_payment'
  | 'payroll'
  | 'equipment_rent'
  | 'utilities'
  | 'marketing'
  | 'legal_notary'
  | 'taxes_corporate'
  | 'admin_office'
  | 'other_expense'

/**
 * Живая форма (`FINANCE_API_EXAMPLES.md`, `POST`/`PATCH`/`GET`): та же для
 * элемента списка и для отдельной записи. `currency` в схеме DTO не
 * описан, но реально присутствует в ответе.
 */
export interface Transaction {
  id: string
  type: TransactionType | null
  category: TransactionCategory | null
  subcategory: string | null
  amountTyiyn: string | null
  currency: string | null
  /** `YYYY-MM-DD`, календарный день Бишкека. */
  date: string | null
  comment: string | null
  /** `null` — сервер не прислал поле или прислал не булево значение; это НЕ «файла нет», см. `access.ts`/`labels.ts`. */
  hasAttachment: boolean | null
  relatedContractId: string | null
  createdById: string | null
  /**
   * Подтверждено живьём: месяц записи закрыт для правок бухгалтером.
   * `null` — сервер не прислал поле или прислал не булево значение; это НЕ
   * «месяц открыт» — неизвестное состояние не должно разрешать правку.
   */
  periodClosed: boolean | null
  createdAt: string | null
  updatedAt: string | null
}

export interface TransactionList {
  items: Transaction[]
  total: number
  limit: number
  offset: number
}

export interface TransactionListQuery {
  from?: string
  to?: string
  type?: TransactionType
  category?: TransactionCategory
  relatedContractId?: string
  limit: number
  offset: number
}

/**
 * `relatedContractId` сюда не входит: свободный текстовый ввод UUID убран
 * из формы создания (нет подборщика договора, риск опечатки) — при
 * необходимости связку задаёт сервер или отдельный сценарий конвертации.
 */
export interface CreateTransactionRequest {
  type: TransactionType
  category: TransactionCategory
  /** Положительное целое число тыйын строкой — ноль не допускается. */
  amountTyiyn: string
  date: string
  subcategory?: string
  comment?: string
}

/**
 * `null` у nullable-полей — явная очистка; отсутствие поля — «не менять».
 * `relatedContractId` сюда не входит по той же причине, что и в
 * `CreateTransactionRequest` — форма правки не отправляет это поле, поэтому
 * существующая связь с договором сохраняется как есть.
 */
export interface UpdateTransactionRequest {
  type?: TransactionType
  category?: TransactionCategory
  amountTyiyn?: string
  date?: string
  subcategory?: string | null
  comment?: string | null
}

export interface AccountingSummaryCategory {
  category: TransactionCategory | null
  label: string | null
  type: TransactionType | null
  count: number | null
  amountTyiyn: string | null
}

export interface AccountingSummary {
  from: string | null
  to: string | null
  incomeTyiyn: string | null
  expenseTyiyn: string | null
  netTyiyn: string | null
  byCategory: AccountingSummaryCategory[]
}
