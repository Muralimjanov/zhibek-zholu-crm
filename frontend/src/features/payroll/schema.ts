import { z } from 'zod'
import { normalizeDecimal2Input, somToTyiyn } from '@/features/contracts/money'
import { PERIOD_PATTERN } from './date'

/**
 * Точные шаблоны `TYIYN_PATTERN`/`DECIMAL2_PATTERN`/`PERIOD_PATTERN` в
 * OpenAPI указаны как имена, без реальных регулярок (см.
 * `CLAUDE_PAYROLL_TASK.md`) — проверяем только очевидный формат ввода,
 * окончательное слово за сервером.
 */
export const payrollSettingsSchema = z.object({
  finePerMissedShift: z
    .string()
    .refine(
      (value) => somToTyiyn(value) !== null,
      'Штраф за прогул: число до двух знаков в сомах, например 1000',
    ),
  taxRatePercent: z
    .string()
    .refine(
      (value) => normalizeDecimal2Input(value) !== null,
      'Налог: число до двух знаков, например 10',
    ),
})

export type PayrollSettingsFormValues = z.infer<typeof payrollSettingsSchema>

export const generatePayrollEntriesSchema = z.object({
  period: z
    .string()
    .refine(
      (value) => PERIOD_PATTERN.test(value),
      'Период: год и месяц в формате ГГГГ-ММ, например 2026-09',
    ),
})

export type GeneratePayrollEntriesFormValues = z.infer<
  typeof generatePayrollEntriesSchema
>

/** Пусто — поле не отправляется (значение не меняется). */
export const correctPayrollEntrySchema = z.object({
  baseSalary: z
    .string()
    .refine(
      (value) => value.trim() === '' || somToTyiyn(value) !== null,
      'Оклад: число до двух знаков в сомах, например 30000',
    ),
  fineAmount: z
    .string()
    .refine(
      (value) => value.trim() === '' || somToTyiyn(value) !== null,
      'Штраф: число до двух знаков в сомах, например 1000',
    ),
})

export type CorrectPayrollEntryFormValues = z.infer<
  typeof correctPayrollEntrySchema
>
