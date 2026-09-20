/**
 * Площадь передаётся строкой с числом до двух знаков после точки
 * (`DECIMAL2_PATTERN` в OpenAPI; примеры backend-инструкции: "60", "45.5").
 * Числом её держать нельзя: метрические и денежные значения в этом API
 * строковые, а float округляет.
 */
export const DECIMAL2_PATTERN = /^\d+(\.\d{1,2})?$/

/**
 * Приводит пользовательский ввод к формату API либо возвращает `null`,
 * если значение не подходит. Запятая принимается как десятичный разделитель:
 * на русской раскладке её вводят чаще точки.
 */
export function normalizeAreaInput(input: string): string | null {
  const compact = input.replace(/\s/g, '').replace(',', '.')

  if (compact === '' || !DECIMAL2_PATTERN.test(compact)) {
    return null
  }

  const [rawInteger, rawFraction = ''] = compact.split('.')
  const integer = rawInteger.replace(/^0+(?=\d)/, '')
  const fraction = rawFraction.replace(/0+$/, '')

  return fraction === '' ? integer : `${integer}.${fraction}`
}

/** Для показа: русский десятичный разделитель. */
export function formatArea(value: string | null): string {
  if (!value) {
    return '—'
  }

  return `${value.replace('.', ',')} м²`
}
