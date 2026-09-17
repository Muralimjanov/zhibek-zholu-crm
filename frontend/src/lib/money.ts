/**
 * Money in the API is an integer string in tyiyn (1 сом = 100 тыйын).
 * Never converted through floating point.
 */
const groupFormatter = new Intl.NumberFormat('ru-RU');

export function formatSom(tyiyn: string | null | undefined, opts: { withCurrency?: boolean; showTyiyn?: boolean } = {}): string {
  if (tyiyn === null || tyiyn === undefined || tyiyn === '') return '—';
  let value: bigint;
  try {
    value = BigInt(tyiyn);
  } catch {
    return '—';
  }
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const som = abs / 100n;
  const rest = abs % 100n;
  const showTyiyn = opts.showTyiyn ?? rest !== 0n;
  const grouped = groupFormatter.format(som);
  const text = `${negative ? '−' : ''}${grouped}${showTyiyn ? `,${rest.toString().padStart(2, '0')}` : ''}`;
  return opts.withCurrency === false ? text : `${text} сом`;
}

/** "1 234 567,5" / "1234567.50" (сом) -> "123456750" (тыйын). null when invalid. */
export function somToTyiyn(input: string): string | null {
  const cleaned = input.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d{1,14}(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return (BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2))).toString();
}

/** "123456750" -> "1234567.5" for editing in an input. */
export function tyiynToSomInput(tyiyn: string | null | undefined): string {
  if (!tyiyn) return '';
  const v = BigInt(tyiyn);
  const rest = v % 100n;
  return rest === 0n ? (v / 100n).toString() : `${v / 100n}.${rest.toString().padStart(2, '0')}`.replace(/0$/, '');
}

export function formatArea(value: string | null | undefined): string {
  if (!value) return '—';
  const n = Number(value);
  return `${Number.isFinite(n) ? n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : value} м²`;
}

export function formatPercent(value: string | null | undefined): string {
  if (!value) return '—';
  return `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
}

/** For charts only (display precision, never stored or sent back). */
export function tyiynToNumber(tyiyn: string): number {
  return Number(BigInt(tyiyn) / 100n);
}
