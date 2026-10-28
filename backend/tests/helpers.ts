import { Prisma } from '@prisma/client';
import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

export const app = createApp();
export const api = () => request(app);

export interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: { field: string; message: string }[] };
}

/** Removes all rows. TRUNCATE bypasses the row-level immutability triggers. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRaw`TRUNCATE TABLE transactions, transfers, accounts CASCADE`;
}

export async function createAccount(name = 'Test Account'): Promise<string> {
  const res = await api().post('/api/accounts').send({ name }).expect(201);
  return (res.body as { data: { id: string } }).data.id;
}

let referenceCounter = 0;
export const nextReference = (prefix = 'REF') => `${prefix}-${++referenceCounter}`;

export function postTransaction(
  accountId: string,
  body: { type: string; amount: string | number; reference_id?: string; description?: string },
) {
  return api().post(`/api/accounts/${accountId}/transactions`).send(body);
}

export async function credit(accountId: string, amount: string): Promise<void> {
  await postTransaction(accountId, { type: 'credit', amount, reference_id: nextReference('CREDIT') }).expect(201);
}

/** Stored balance read directly from the database, as a fixed-point string. */
export async function storedBalance(accountId: string): Promise<string> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  return account.balance.toFixed(2);
}

/** Balance recomputed independently from the ledger: SUM(credits) - SUM(debits). */
export async function ledgerBalance(accountId: string): Promise<string> {
  const rows = await prisma.$queryRaw<{ total: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE -amount END), 0) AS total
    FROM transactions WHERE account_id = ${accountId}::uuid
  `;
  return new Prisma.Decimal(rows[0]?.total ?? 0).toFixed(2);
}

/** Asserts the stored balance equals the expected value AND the ledger-derived balance. */
export async function expectConsistentBalance(accountId: string, expected: string): Promise<void> {
  expect(await storedBalance(accountId)).toBe(expected);
  expect(await ledgerBalance(accountId)).toBe(expected);
}

export const countTransactions = (accountId: string) => prisma.transaction.count({ where: { accountId } });

interface FailingTrigger {
  table: 'accounts' | 'transactions' | 'transfers';
  /** e.g. 'BEFORE UPDATE' or 'AFTER INSERT'. Ignored when deferred. */
  timing?: string;
  /** SQL boolean expression over NEW limiting which rows fail. */
  condition?: string;
  /** Fire at COMMIT time (constraint trigger), i.e. after every statement has run. */
  deferred?: boolean;
}

/**
 * Installs a temporary PostgreSQL trigger that raises an exception, simulating a
 * database failure part-way through an operation. The trigger is always removed.
 * Only called with constant SQL from the test files.
 */
export async function withFailingTrigger(trigger: FailingTrigger, run: () => Promise<void>): Promise<void> {
  const when = trigger.condition ? `WHEN (${trigger.condition})` : '';
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION test_simulated_failure() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'simulated failure'; END;
    $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(
    trigger.deferred
      ? `CREATE CONSTRAINT TRIGGER test_failure AFTER INSERT ON ${trigger.table}
         DEFERRABLE INITIALLY DEFERRED FOR EACH ROW ${when} EXECUTE FUNCTION test_simulated_failure()`
      : `CREATE TRIGGER test_failure ${trigger.timing ?? 'BEFORE INSERT'} ON ${trigger.table}
         FOR EACH ROW ${when} EXECUTE FUNCTION test_simulated_failure()`,
  );
  try {
    await run();
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_failure ON ${trigger.table}`);
  }
}
