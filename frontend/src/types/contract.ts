/**
 * Типы договоров.
 *
 * Тела ответов `GET /contracts` и `GET /contracts/{id}` в OpenAPI не описаны;
 * форма подтверждена фактическим ответом staging под `demo_director`,
 * зафиксированным в `CONTRACTS_API_EXAMPLES.md`. Тела запросов взяты из
 * опубликованной схемы и backend-инструкции `API_TESTING.md` (раздел 6):
 * `CreateContractDto` в схеме показывает только `address`, `managerId`,
 * `areaSqm`, `pricePerSqmTyiyn`, `depositPercent`, хотя инструкция требует
 * также данные покупателя и согласие — пробел в схеме не значит, что поля
 * не нужны.
 *
 * Деньги и площадь — строки (`DECIMAL2_PATTERN`, `TYIYN_PATTERN`), 1 сом =
 * 100 тыйын. `depositPaid` и `hasFile` — boolean.
 */

export type ContractStatus = 'draft' | 'deposit_paid' | 'signed'

export type ContractStatusFilter = ContractStatus

export interface CreateContractRequest {
  fullName: string
  passportNumber: string
  phone: string
  email?: string
  address: string
  areaSqm: string
  pricePerSqmTyiyn: string
  /** По умолчанию "30" на сервере, если не передано. */
  depositPercent?: string
  buyerConsentConfirmed: true
  buyerConsentVersion: string
  /** Обязателен для директора; правило для остальных ролей не описано в API. */
  managerId?: string
}

export interface ConvertBookingRequest {
  address: string
  /** Если не передать, сервер берёт желаемую площадь брони. */
  areaSqm?: string
  pricePerSqmTyiyn: string
  depositPercent?: string
  buyerConsentConfirmed: true
  buyerConsentVersion: string
}

export interface UpdateContractRequest {
  fullName?: string
  passportNumber?: string
  address?: string
  phone?: string
  /** `null` очищает почту. */
  email?: string | null
  areaSqm?: string
  pricePerSqmTyiyn?: string
  depositPercent?: string
  managerId?: string
}

/**
 * Модель, которую строит `parse.ts` из фактического ответа сервера.
 * Бухгалтерское представление `GET /contracts` не содержит персональных
 * данных покупателя (подтверждено описанием операции в OpenAPI: "Accountant
 * receives a finance-only view without buyer PII") — поэтому эти поля
 * всегда `string | null`, а не обязательные `string`.
 */
export interface Contract {
  id: string
  status: ContractStatus | null
  areaSqm: string | null
  pricePerSqmTyiyn: string | null
  totalAmountTyiyn: string | null
  depositPercent: string | null
  depositAmountTyiyn: string | null
  depositPaid: boolean
  depositPaidAt: string | null
  hasFile: boolean
  managerId: string | null
  /** `null`, если договор создан напрямую, а не конвертацией брони. */
  bookingId: string | null
  createdAt: string | null
  updatedAt: string | null

  /** Отсутствует в бухгалтерском представлении. */
  fullName: string | null
  /** В списке маскируется сервером, в полной карточке — полный номер. */
  passportNumber: string | null
  address: string | null
  phone: string | null
  email: string | null
  buyerConsentVersion: string | null
  buyerConsentConfirmedAt: string | null
}

export interface ContractList {
  items: Contract[]
  total: number
  limit: number
  offset: number
}

export interface ContractListQuery {
  status?: ContractStatusFilter
  managerId?: string
  passportNumber?: string
  phone?: string
  limit: number
  offset: number
}
