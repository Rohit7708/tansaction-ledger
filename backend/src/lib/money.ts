import { Prisma } from '@prisma/client';

/**
 * All monetary values are handled as exact decimals (Prisma.Decimal / decimal.js)
 * and serialized as strings with exactly two fraction digits. JavaScript numbers
 * are never used for arithmetic on money.
 */
export const MONEY_SCALE = 2;

/** Largest amount accepted for a single transaction or transfer. */
export const MAX_TRANSACTION_AMOUNT = '1000000000.00';

/** Plain decimal notation, up to 10 integer digits and at most 2 fraction digits. */
export const MONEY_PATTERN = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;

export const toDecimal = (value: string | Prisma.Decimal): Prisma.Decimal => new Prisma.Decimal(value);

export const formatMoney = (value: Prisma.Decimal): string => value.toFixed(MONEY_SCALE);
