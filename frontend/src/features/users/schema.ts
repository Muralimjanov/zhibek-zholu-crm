import { z } from 'zod'

/** Шаблон логина из CreateUserDto: /^[a-zA-Z0-9._-]+$/ */
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Не короче 3 символов')
    .max(64, 'Не длиннее 64 символов')
    .regex(
      USERNAME_PATTERN,
      'Только латинские буквы, цифры, точка, подчёркивание и дефис',
    ),
  password: z
    .string()
    .min(12, 'Не короче 12 символов')
    .max(256, 'Не длиннее 256 символов'),
  fullName: z
    .string()
    .trim()
    .min(1, 'Введите ФИО')
    .max(200, 'Не длиннее 200 символов'),
  phone: z.string().trim().max(32, 'Не длиннее 32 символов'),
  // Обязателен с API 0.2.0: на этот адрес приходит код входа сотрудника.
  email: z
    .string()
    .trim()
    .min(1, 'Введите почту — на неё приходит код входа')
    .max(254, 'Не длиннее 254 символов')
    .refine((value) => EMAIL_PATTERN.test(value), 'Проверьте адрес почты'),
  role: z.string().min(1, 'Выберите роль'),
})

export type CreateUserFormValues = z.infer<typeof createUserSchema>

export const confirmCodeSchema = z
  .string()
  .trim()
  .min(4, 'Код короче 4 символов')
  .max(16, 'Код длиннее 16 символов')
