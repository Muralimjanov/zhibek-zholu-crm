import {
  contractTotal,
  decimalToCenti,
  formatCenti,
  mulDivRoundHalfUp,
  parseCenti,
  parseTyiyn,
  percentOf,
} from './money';

describe('money', () => {
  it('reproduces the TZ contract example: 60 m² × 50 000 KGS = 3 000 000 KGS, deposit 30% = 900 000 KGS', () => {
    const total = contractTotal(parseCenti('60'), parseTyiyn('5000000'));
    expect(total).toBe(300_000_000n); // tyiyn
    expect(percentOf(total, parseCenti('30'))).toBe(90_000_000n);
  });

  it('reproduces the TZ payroll example: 30 000 salary, 10% tax, 2 × 1 000 fine -> 25 000', () => {
    const base = parseTyiyn('3000000');
    const tax = percentOf(base, parseCenti('10'));
    const fine = 2n * parseTyiyn('100000');
    expect(base - tax - fine).toBe(2_500_000n);
  });

  it('handles fractional areas and rounds half-up to a tyiyn', () => {
    // 45.55 m² × 1 001 tyiyn = 45 595.55 -> 45 596
    expect(contractTotal(parseCenti('45.55'), 1001n)).toBe(45_596n);
    // 12.5% of 1 tyiyn = 0.125 -> 0 ; 50% of 1 tyiyn = 0.5 -> 1
    expect(percentOf(1n, parseCenti('12.5'))).toBe(0n);
    expect(percentOf(1n, parseCenti('50'))).toBe(1n);
    expect(mulDivRoundHalfUp(5n, 1n, 10n)).toBe(1n);
    expect(mulDivRoundHalfUp(4n, 1n, 10n)).toBe(0n);
  });

  it('never loses precision on large amounts (beyond Number.MAX_SAFE_INTEGER)', () => {
    const huge = parseTyiyn('9999999999999999');
    expect(contractTotal(parseCenti('9999999.99'), huge).toString()).toBe('99999999899999990000000');
  });

  it('rejects malformed input instead of guessing', () => {
    for (const bad of ['-1', '1.5', '1e5', ' 10', '0x10', '', '01']) {
      expect(() => parseTyiyn(bad)).toThrow();
    }
    for (const bad of ['-1', '1.555', 'abc', '1,5', '.5']) {
      expect(() => parseCenti(bad)).toThrow();
    }
  });

  it('formats and parses Decimal(…,2) strings', () => {
    expect(formatCenti(4550n)).toBe('45.50');
    expect(decimalToCenti('30')).toBe(3000n);
    expect(decimalToCenti('45.5')).toBe(4550n);
    expect(decimalToCenti('0.07')).toBe(7n);
  });
});

describe('assertFitsBigint', () => {
  it('rejects amounts that would overflow a PostgreSQL BIGINT column', () => {
    const { assertFitsBigint, MAX_DB_BIGINT } = jest.requireActual('./money');
    expect(assertFitsBigint(MAX_DB_BIGINT, 'x')).toBe(MAX_DB_BIGINT);
    expect(() => assertFitsBigint(MAX_DB_BIGINT + 1n, 'totalAmountTyiyn')).toThrow('totalAmountTyiyn is out of range');
  });
});
