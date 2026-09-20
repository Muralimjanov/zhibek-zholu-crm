import { z } from 'zod'
import { DATE_ONLY_PATTERN, todayInBishkek } from './date'

export const createDayOffSchema = z.object({
  userId: z.string().min(1, 'Выберите сотрудника'),
  date: z
    .string()
    .refine((value) => DATE_ONLY_PATTERN.test(value), 'Укажите дату')
    .refine(
      (value) => !DATE_ONLY_PATTERN.test(value) || value >= todayInBishkek(),
      'Дата не может быть в прошлом (по времени Бишкека)',
    ),
  // Пусто — поле не отправляем; если заполнено, сервер ждёт 1–500 символов.
  reason: z.string().trim().max(500, 'Не длиннее 500 символов'),
})

export type CreateDayOffFormValues = z.infer<typeof createDayOffSchema>
