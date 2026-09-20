import { z } from 'zod'

/** Шаблон телефона взят из OpenAPI: /^\+?[0-9 ()-]{5,32}$/ */
const PHONE_PATTERN = /^\+?[0-9 ()-]{5,32}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * С API 0.2.0 `UpdateProfileDto` не принимает `email` — почта меняется
 * отдельным сценарием (см. `ChangeEmailFlow.tsx`), не этой формой.
 */
export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Введите ФИО')
    .max(200, 'Не длиннее 200 символов'),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || PHONE_PATTERN.test(value),
      'Телефон: от 5 до 32 символов — цифры, пробелы, скобки и дефис, можно с «+»',
    ),
})

export type ProfileFormValues = z.infer<typeof profileSchema>

export const newEmailSchema = z
  .string()
  .trim()
  .min(1, 'Введите новый адрес почты')
  .max(254, 'Не длиннее 254 символов')
  .refine((value) => EMAIL_PATTERN.test(value), 'Проверьте адрес почты')

export const emailCodeSchema = z.string().trim().min(1, 'Введите код из письма')

export const newPasswordSchema = z
  .string()
  .min(12, 'Не короче 12 символов')
  .max(256, 'Не длиннее 256 символов')
