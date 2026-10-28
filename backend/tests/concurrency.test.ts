import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import {
  countTransactions,
  createAccount,
  credit,
  type ErrorBody,
  expectConsistentBalance,
  postTransaction,
  resetDatabase,
} from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const codes = (responses: { status: number; body: unknown }[]) =>
  responses.map((r) => (r.status === 201 ? 'OK' : (r.body as ErrorBody).error.code)).sort();

describe('concurrent requests against PostgreSQL', () => {
  it('lets exactly one of two concurrent 80.00 debits succeed against a 100.00 balance', async () => {
    // Repeated so the two requests genuinely overlap in at least some rounds.
    for (let round = 0; round < 10; round++) {
      const id = await createAccount(`Race ${round}`);
      await credit(id, '100.00');

      const responses = await Promise.all([
        postTransaction(id, { type: 'debit', amount: '80.00', reference_id: 'D-1' }),
        postTransaction(id, { type: 'debit', amount: '80.00', reference_id: 'D-2' }),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(codes(responses)).toEqual(['INSUFFICIENT_BALANCE', 'OK']);
      expect(await prisma.transaction.count({ where: { accountId: id, type: 'DEBIT' } })).toBe(1);
      await expectConsistentBalance(id, '20.00');
    }
  });

  it('never overdraws under many concurrent debits', async () => {
    const id = await createAccount();
    await credit(id, '100.00');

    const responses = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        postTransaction(id, { type: 'debit', amount: '30.00', reference_id: `MANY-${i}` }),
      ),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(3);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(12);
    await expectConsistentBalance(id, '10.00');
  });

  it('records a reference only once when the same request is sent concurrently', async () => {
    const id = await createAccount();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        postTransaction(id, { type: 'credit', amount: '50.00', reference_id: 'SAME-REF' }),
      ),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(codes(responses).filter((c) => c === 'DUPLICATE_TRANSACTION')).toHaveLength(9);
    expect(await countTransactions(id)).toBe(1);
    await expectConsistentBalance(id, '50.00');
  });

  it('applies concurrent duplicate debits only once', async () => {
    const id = await createAccount();
    await credit(id, '100.00');

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => postTransaction(id, { type: 'debit', amount: '10.00', reference_id: 'PAY' })),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    await expectConsistentBalance(id, '90.00');
  });

  it('keeps the stored balance equal to the ledger under a concurrent mix of credits and debits', async () => {
    const id = await createAccount();
    await credit(id, '50.00');

    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        postTransaction(id, {
          type: i % 3 === 0 ? 'credit' : 'debit',
          amount: i % 3 === 0 ? '20.00' : '15.00',
          reference_id: `MIX-${i}`,
        }),
      ),
    );

    expect(responses.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    const account = await prisma.account.findUniqueOrThrow({ where: { id } });
    expect(account.balance.gte(0)).toBe(true);
    await expectConsistentBalance(id, account.balance.toFixed(2));
  });
});
