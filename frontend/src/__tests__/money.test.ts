import { formatSom, somToTyiyn, tyiynToSomInput } from '@/lib/money';

describe('money (tyiyn strings, no floating point)', () => {
  it('formats som with grouping and optional tyiyn', () => {
    expect(formatSom('300000000').replace(/\s/g, ' ')).toBe('3 000 000 сом');
    expect(formatSom('1500050').replace(/\s/g, ' ')).toBe('15 000,50 сом');
    expect(formatSom('-150').replace(/\s/g, ' ')).toBe('−1,50 сом');
    expect(formatSom(null)).toBe('—');
    expect(formatSom('not-a-number')).toBe('—');
  });

  it('parses user input into tyiyn exactly', () => {
    expect(somToTyiyn('15 000,50')).toBe('1500050');
    expect(somToTyiyn('50000')).toBe('5000000');
    expect(somToTyiyn('0.1')).toBe('10');
    expect(somToTyiyn('99999999999999.99')).toBe('9999999999999999');
    expect(somToTyiyn('1.005')).toBeNull();
    expect(somToTyiyn('-5')).toBeNull();
    expect(somToTyiyn('abc')).toBeNull();
  });

  it('round-trips through the edit input', () => {
    for (const t of ['0', '5', '10', '1500050', '5000000']) {
      expect(somToTyiyn(tyiynToSomInput(t) || '0')).toBe(t);
    }
  });
});
