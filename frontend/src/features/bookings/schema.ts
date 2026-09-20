import { z } from 'zod'
import { normalizeAreaInput } from './area'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Точные шаблоны паспорта и телефона в OpenAPI скрыты за именами
 * `PASSPORT_PATTERN` и `PHONE_PATTERN`, поэтому на клиенте проверяем только
 * очевидное, а окончательное слово оставляем серверу: его 400 показываем
 * возле поля.
 */
export const bookingFieldsSchema = z.object({
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
  desiredAreaSqm: z
    .string()
    .refine(
      (value) => normalizeAreaInput(value) !== null,
      'Площадь: число до двух знаков, например 60 или 45,5',
    ),
})

export const createBookingSchema = bookingFieldsSchema.extend({
  managerId: z.string(),
  consentAccepted: z
    .boolean()
    .refine((value) => value, 'Подтвердите согласие покупателя'),
})

export const editBookingSchema = bookingFieldsSchema.extend({
  managerId: z.string(),
})

export type CreateBookingFormValues = z.infer<typeof createBookingSchema>
export type EditBookingFormValues = z.infer<typeof editBookingSchema>
