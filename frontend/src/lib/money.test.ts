import { describe, expect, it } from 'vitest';
import { formatMoney, fromCents, normalizeAmount, sumAmounts, toCents, validateAmount } from './money';

describe('money helpers', () => {
  it('converts between decimal strings and cents exactly', () => {
    expect(toCents('100.00')).toBe(10000n);
    expect(toCents('0.1')).toBe(10n);
    expect(toCents('-2.05')).toBe(-205n);
    expect(fromCents(10n)).toBe('0.10');
    expect(fromCents(-205n)).toBe('-2.05');
  });

  it('sums without floating-point error', () => {
    expect(sumAmounts(['0.10', '0.20'])).toBe('0.30');
    expect(sumAmounts([])).toBe('0.00');
    expect(sumAmounts(['999999999999.99', '0.01'])).toBe('1000000000000.00');
  });

  it.each(['', '0', '0.00', '-1', '1.001', 'abc', '1e3', '01', '1000000000.01'])('rejects "%s"', (value) => {
    expect(validateAmount(value)).not.toBeNull();
  });

  it.each(['1', '0.01', '100.5', '1000000000.00'])('accepts "%s"', (value) => {
    expect(validateAmount(value)).toBeNull();
  });

  it('normalizes and formats amounts', () => {
    expect(normalizeAmount(' 5 ')).toBe('5.00');
    expect(normalizeAmount('100.5')).toBe('100.50');
    expect(formatMoney('1234567.80')).toBe('1,234,567.80');
  });
});
