/**
 * Client-side money helpers. Amounts stay decimal strings end to end; sums are
 * computed in integer cents with BigInt so no floating-point rounding occurs.
 * The server remains the source of truth and re-validates everything.
 */

export const MAX_AMOUNT = '1000000000.00';
const MONEY_PATTERN = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;

export function toCents(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
  return negative ? -cents : cents;
}

export function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export const sumAmounts = (values: string[]): string => fromCents(values.reduce((total, v) => total + toCents(v), 0n));

/** Returns an error message, or null when the amount is a valid positive money value. */
export function validateAmount(raw: string): string | null {
  const value = raw.trim();
  if (value === '') {
    return 'Amount is required.';
  }
  if (!MONEY_PATTERN.test(value)) {
    return 'Enter a positive amount with at most 2 decimal places, e.g. 100.00.';
  }
  const cents = toCents(value);
  if (cents <= 0n) {
    return 'Amount must be greater than zero.';
  }
  if (cents > toCents(MAX_AMOUNT)) {
    return `Amount must not exceed ${formatMoney(MAX_AMOUNT)}.`;
  }
  return null;
}

/** Normalizes a validated amount to two decimals, e.g. "5" -> "5.00". */
export const normalizeAmount = (value: string): string => fromCents(toCents(value.trim()));

const formatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formats a decimal string for display without converting it to a float. */
export const formatMoney = (value: string): string => formatter.format(value as Intl.StringNumericLiteral);
