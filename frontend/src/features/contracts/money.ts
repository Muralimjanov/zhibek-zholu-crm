/**
 * Деньги в API — целые тыйыны строкой, 1 сом = 100 тыйын (`API_TESTING.md`,
 * раздел «Соглашения для фронтенда»). Все преобразования — целочисленная
 * строковая арифметика: `Number`/float на суммах до 10^16 теряют точность.
 */

/** Целое неотрицательное число тыйын строкой, без незначащих нулей. */
export const TYIYN_PATTERN = /^(0|[1-9]\d{0,15})$/

/** Площадь и проценты: до двух знаков после точки. */
export const DECIMAL2_PATTERN = /^\d+(\.\d{1,2})?$/

function stripLeadingZeros(digits: string): string {
  const trimmed = digits.replace(/^0+(?=\d)/, '')

  return trimmed === '' ? '0' : trimmed
}

/**
 * "50000" (сом) → "5000000" (тыйын). Принимает запятую как разделитель.
 * Возвращает `null`, если ввод не число до двух знаков.
 */
export function somToTyiyn(input: string): string | null {
  const compact = input.replace(/\s/g, '').replace(',', '.')

  if (compact === '' || !DECIMAL2_PATTERN.test(compact)) {
    return null
  }

  const [integer, fraction = ''] = compact.split('.')
  const paddedFraction = (fraction + '00').slice(0, 2)
  const tyiyn = stripLeadingZeros(`${integer}${paddedFraction}`)

  return TYIYN_PATTERN.test(tyiyn) ? tyiyn : null
}

/** "5000000" (тыйын) → { whole: "50000", fraction: "00" } (сом). */
function splitTyiynAsSom(value: string): { whole: string; fraction: string } {
  const digits = value.padStart(3, '0')

  return {
    whole: stripLeadingZeros(digits.slice(0, -2)),
    fraction: digits.slice(-2),
  }
}

/** Разряды через пробел, для показа человеку. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/**
 * "5000000" → "50 000,00 сом". Не показывает копейки, если ввод не
 * распознан как валидное целое тыйын — тогда возвращает "—", а не угадывает.
 */
export function formatTyiynAsSom(value: string | null): string {
  if (!value || !TYIYN_PATTERN.test(value)) {
    return '—'
  }

  const { whole, fraction } = splitTyiynAsSom(value)

  return `${groupThousands(whole)},${fraction} сом`
}

/**
 * Как `formatTyiynAsSom`, но допускает ведущий знак минус — для сумм,
 * которые в принципе могут быть отрицательными (например, `netTyiyn` из
 * `GET /accounting/summary`, когда расход превысил приход за период;
 * `TYIYN_PATTERN` их не описывает, так как для сумм договоров и начислений,
 * которые здесь и раньше форматировались, отрицательное значение
 * невозможно).
 */
export function formatSignedTyiynAsSom(value: string | null): string {
  if (!value) {
    return '—'
  }

  if (value.startsWith('-')) {
    const magnitude = formatTyiynAsSom(value.slice(1))

    return magnitude === '—' ? '—' : `-${magnitude}`
  }

  return formatTyiynAsSom(value)
}

/** Для показа процента: "30.00" → "30 %". */
export function formatPercent(value: string | null): string {
  if (!value) {
    return '—'
  }

  return `${value.replace('.', ',').replace(/,00$/, '')} %`
}

/**
 * Приводит пользовательский ввод площади/процента к формату API
 * (`DECIMAL2_PATTERN`) либо возвращает `null`.
 */
export function normalizeDecimal2Input(input: string): string | null {
  const compact = input.replace(/\s/g, '').replace(',', '.')

  if (compact === '' || !DECIMAL2_PATTERN.test(compact)) {
    return null
  }

  const [rawInteger, rawFraction = ''] = compact.split('.')
  const integer = stripLeadingZeros(rawInteger)
  const fraction = rawFraction.replace(/0+$/, '')

  return fraction === '' ? integer : `${integer}.${fraction}`
}
