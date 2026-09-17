/**
 * Exact money/quantity arithmetic. TZ_CRM_DEV_v2: amounts are stored in
 * tyiyn (1 KGS = 100 tyiyn) to avoid floating-point rounding errors.
 *
 * All inputs arrive from the API as decimal STRINGS and are parsed into
 * BigInt fixed-point values; JavaScript numbers are never used for money.
 *
 * Rounding: half-up to the nearest tyiyn. OPEN QUESTION (see
 * OPEN_QUESTIONS_ADDENDUM.md): the TZ phrase "округляется до сома" may mean
 * rounding to whole som instead.
 */

/** Non-negative integer amount in tyiyn, e.g. "5000000" (= 50 000 KGS). */
export const TYIYN_PATTERN = /^(0|[1-9]\d{0,15})$/;
/** Up to 2 decimal places, e.g. "60", "45.5", "120.25". */
export const DECIMAL2_PATTERN = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;

export function parseTyiyn(value: string): bigint {
  if (!TYIYN_PATTERN.test(value)) throw new Error(`Invalid tyiyn amount: ${value}`);
  return BigInt(value);
}

/** "45.5" -> 4550n (hundredths). */
export function parseCenti(value: string): bigint {
  if (!DECIMAL2_PATTERN.test(value)) throw new Error(`Invalid decimal value: ${value}`);
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}

/** 4550n -> "45.50" */
export function formatCenti(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** Prisma Decimal(…, 2) (or its string form) -> hundredths as BigInt. */
export function decimalToCenti(value: { toString(): string } | string): bigint {
  const str = typeof value === 'string' ? value : value.toString();
  const negative = str.startsWith('-');
  const [whole, frac = ''] = (negative ? str.slice(1) : str).split('.');
  const centi = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0').slice(0, 2));
  return negative ? -centi : centi;
}

/** round(a * b / divisor), half-up, for non-negative operands. */
export function mulDivRoundHalfUp(a: bigint, b: bigint, divisor: bigint): bigint {
  if (a < 0n || b < 0n || divisor <= 0n) throw new Error('mulDivRoundHalfUp expects non-negative operands');
  return (a * b * 2n + divisor) / (divisor * 2n);
}

/** total = area_sqm × price_per_sqm (area in hundredths of m²). */
export function contractTotal(areaCenti: bigint, pricePerSqmTyiyn: bigint): bigint {
  return mulDivRoundHalfUp(areaCenti, pricePerSqmTyiyn, 100n);
}

/** deposit = total × deposit_percent / 100 (percent in hundredths). */
export function percentOf(amountTyiyn: bigint, percentCenti: bigint): bigint {
  return mulDivRoundHalfUp(amountTyiyn, percentCenti, 10_000n);
}

/** Largest value a PostgreSQL BIGINT column can hold. */
export const MAX_DB_BIGINT = 9_223_372_036_854_775_807n;

/** Throws if a computed amount would overflow its BIGINT column. */
export function assertFitsBigint(value: bigint, field: string): bigint {
  if (value > MAX_DB_BIGINT || value < -MAX_DB_BIGINT) {
    throw new RangeError(`${field} is out of range`);
  }
  return value;
}
