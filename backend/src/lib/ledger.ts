import { Prisma } from '@prisma/client';
import type { PrismaTx } from './prisma.js';

export interface LockedAccount {
  id: string;
  balance: Prisma.Decimal;
}

/**
 * Acquires a row-level write lock (SELECT ... FOR UPDATE) on an account for the
 * rest of the surrounding database transaction. Concurrent writers to the same
 * account queue here, so any balance read after this call is current and cannot
 * change until the transaction commits or rolls back.
 */
export async function lockAccount(tx: PrismaTx, accountId: string): Promise<LockedAccount | null> {
  const rows = await tx.$queryRaw<LockedAccount[]>`
    SELECT id, balance FROM accounts WHERE id = ${accountId}::uuid FOR UPDATE
  `;
  return rows[0] ?? null;
}

/** True when the error is a unique-constraint violation on the given target columns. */
export function isUniqueViolation(err: unknown, column: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }
  const target = err.meta?.target;
  if (Array.isArray(target)) {
    return target.includes(column);
  }
  return typeof target === 'string' && target.includes(column);
}
