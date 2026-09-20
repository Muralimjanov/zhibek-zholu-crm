import { z } from 'zod'
import { normalizeDecimal2Input, somToTyiyn } from './money'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Точные шаблоны паспорта, телефона и денег в OpenAPI скрыты за именами
 * (`PASSPORT_PATTERN`, `PHONE_PATTERN`, `TYIYN_PATTERN`), поэтому на клиенте
 * проверяем только очевидное — окончательное слово за сервером.
 */
const buyerFieldsSchema = {
  fullName: z
    .string()
    .trim()
    .min(1, 'Введите ФИО покупателя')
    .max(200, 'Не длиннее 200 символов'),
  passportNumber: z
    .string()
    .trim()
    .min(3, 'Введите номер паспорта')
    .max(64, 'Не длиннее 64 символов'),
  phone: z
    .string()
    .trim()
    .min(5, 'Введите телефон')
    .max(32, 'Не длиннее 32 символов'),
  email: z
    .string()
    .trim()
    .max(254, 'Не длиннее 254 символов')
    .refine(
      (value) => value === '' || EMAIL_PATTERN.test(value),
      'Проверьте адрес почты',
    ),
}

const dealFieldsSchema = {
  address: z
    .string()
    .trim()
    .min(1, 'Введите адрес объекта')
    .max(500, 'Не длиннее 500 символов'),
  areaSqm: z
    .string()
    .refine(
      (value) => normalizeDecimal2Input(value) !== null,
      'Площадь: число до двух знаков, например 60 или 45,5',
    ),
  pricePerSqm: z
    .string()
    .refine(
      (value) => somToTyiyn(value) !== null,
      'Цена за м²: число до двух знаков в сомах, например 50000',
    ),
  // Пусто — сервер подставит значение по умолчанию (30%), которое не выдумываем.
  depositPercent: z
    .string()
    .refine(
      (value) => value === '' || normalizeDecimal2Input(value) !== null,
      'Процент взноса: число до двух знаков, например 30',
    ),
}

export const createContractSchema = z.object({
  ...buyerFieldsSchema,
  ...dealFieldsSchema,
  managerId: z.string(),
  consentAccepted: z
    .boolean()
    .refine((value) => value, 'Подтвердите согласие покупателя'),
})

export const convertBookingSchema = z.object({
  address: dealFieldsSchema.address,
  pricePerSqm: dealFieldsSchema.pricePerSqm,
  depositPercent: dealFieldsSchema.depositPercent,
  consentAccepted: z
    .boolean()
    .refine((value) => value, 'Подтвердите согласие покупателя'),
})

export const editContractSchema = z.object({
  ...buyerFieldsSchema,
  ...dealFieldsSchema,
  managerId: z.string(),
})

export type CreateContractFormValues = z.infer<typeof createContractSchema>
export type ConvertBookingFormValues = z.infer<typeof convertBookingSchema>
export type EditContractFormValues = z.infer<typeof editContractSchema>
