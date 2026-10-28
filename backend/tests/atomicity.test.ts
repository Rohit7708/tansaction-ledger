import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import {
  countTransactions,
  createAccount,
  credit,
  type ErrorBody,
  expectConsistentBalance,
  postTransaction,
  resetDatabase,
  withFailingTrigger,
} from './helpers.js';

beforeEach(async () => {
  await resetDatabase();
  // Simulated failures are logged by the error middleware; keep test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

/**
 * Failures are injected with temporary PostgreSQL triggers so that the real
 * service code runs unchanged and fails part-way through its database transaction.
 */
describe('atomicity of credit/debit', () => {
  it('rolls back the balance update when the ledger insert fails at commit time', async () => {
    const id = await createAccount();
    await credit(id, '100.00');

    // A deferred trigger fires at COMMIT, i.e. after BOTH the insert and the
    // balance update have executed, so the balance change has really happened.
    await withFailingTrigger(
      { table: 'transactions', deferred: true, condition: "NEW.reference_id = 'FAIL-COMMIT'" },
      async () => {
        const res = await postTransaction(id, { type: 'debit', amount: '40.00', reference_id: 'FAIL-COMMIT' });

        expect(res.status).toBe(500);
        expect((res.body as ErrorBody).error).toEqual({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred.',
        });
      },
    );

    expect(await countTransactions(id)).toBe(1);
    await expectConsistentBalance(id, '100.00');
  });

  it('rolls back the balance update when the ledger insert itself fails', async () => {
    const id = await createAccount();
    await credit(id, '100.00');

    await withFailingTrigger(
      { table: 'transactions', timing: 'AFTER INSERT', condition: "NEW.reference_id = 'FAIL-INSERT'" },
      async () => {
        await postTransaction(id, { type: 'credit', amount: '25.00', reference_id: 'FAIL-INSERT' }).expect(500);
      },
    );

    expect(await countTransactions(id)).toBe(1);
    await expectConsistentBalance(id, '100.00');
  });

  it('rolls back the ledger insert when the balance update fails', async () => {
    const id = await createAccount();
    await credit(id, '100.00');

    // The ledger row is inserted before the balance update; failing the update
    // must remove that row too.
    await withFailingTrigger({ table: 'accounts', timing: 'BEFORE UPDATE' }, async () => {
      await postTransaction(id, { type: 'credit', amount: '10.00', reference_id: 'FAIL-UPDATE' }).expect(500);
      await postTransaction(id, { type: 'debit', amount: '10.00', reference_id: 'FAIL-UPDATE-2' }).expect(500);
    });

    expect(await countTransactions(id)).toBe(1);
    await expectConsistentBalance(id, '100.00');
  });

  it('rolls back the ledger insert when a debit is rejected for insufficient balance', async () => {
    const id = await createAccount();
    await credit(id, '10.00');

    await postTransaction(id, { type: 'debit', amount: '10.01', reference_id: 'NSF' }).expect(409);

    const leftovers = await prisma.transaction.count({ where: { referenceId: 'NSF' } });
    expect(leftovers).toBe(0);
    await expectConsistentBalance(id, '10.00');
  });

  it('keeps working normally after a failed transaction', async () => {
    const id = await createAccount();
    await withFailingTrigger({ table: 'accounts', timing: 'BEFORE UPDATE' }, async () => {
      await postTransaction(id, { type: 'credit', amount: '10.00', reference_id: 'X' }).expect(500);
    });

    await postTransaction(id, { type: 'credit', amount: '10.00', reference_id: 'X' }).expect(201);

    await expectConsistentBalance(id, '10.00');
  });
});
