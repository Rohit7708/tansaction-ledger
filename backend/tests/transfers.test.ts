import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import {
  api,
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
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

interface TransferBody {
  from_account_id: string;
  to_account_id: string;
  amount: string;
  reference_id: string;
  description?: string;
}

const transfer = (body: TransferBody | Record<string, unknown>) => api().post('/api/transfers').send(body);

async function fundedPair(sourceBalance = '100.00') {
  const from = await createAccount('Source');
  const to = await createAccount('Destination');
  await credit(from, sourceBalance);
  return { from, to };
}

async function expectNothingTransferred(from: string, to: string, sourceBalance = '100.00') {
  expect(await prisma.transfer.count()).toBe(0);
  expect(await countTransactions(from)).toBe(1);
  expect(await countTransactions(to)).toBe(0);
  await expectConsistentBalance(from, sourceBalance);
  await expectConsistentBalance(to, '0.00');
}

describe('POST /api/transfers', () => {
  it('debits the source, credits the destination and records both ledger entries', async () => {
    const { from, to } = await fundedPair();

    const res = await transfer({
      from_account_id: from,
      to_account_id: to,
      amount: '30.00',
      reference_id: 'TRANSFER-001',
      description: 'Rent share',
    }).expect(201);

    const data = res.body.data;
    expect(data.transfer).toMatchObject({ from_account_id: from, to_account_id: to, amount: '30.00' });
    expect(data.debit_transaction).toMatchObject({
      account_id: from,
      type: 'debit',
      amount: '30.00',
      reference_id: 'transfer:TRANSFER-001',
      transfer_id: data.transfer.id,
      description: 'Rent share',
    });
    expect(data.credit_transaction).toMatchObject({
      account_id: to,
      type: 'credit',
      amount: '30.00',
      transfer_id: data.transfer.id,
    });
    expect(data.from_account.balance).toBe('70.00');
    expect(data.to_account.balance).toBe('30.00');
    await expectConsistentBalance(from, '70.00');
    await expectConsistentBalance(to, '30.00');
  });

  it('rejects insufficient source balance without moving money', async () => {
    const { from, to } = await fundedPair();

    const res = await transfer({ from_account_id: from, to_account_id: to, amount: '100.01', reference_id: 'T' });

    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).error.code).toBe('INSUFFICIENT_BALANCE');
    await expectNothingTransferred(from, to);
  });

  it('returns 404 for a missing source account', async () => {
    const to = await createAccount();

    const res = await transfer({ from_account_id: randomUUID(), to_account_id: to, amount: '1', reference_id: 'T' });

    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error.code).toBe('SOURCE_ACCOUNT_NOT_FOUND');
    await expectConsistentBalance(to, '0.00');
  });

  it('returns 404 for a missing destination account', async () => {
    const { from } = await fundedPair();

    const res = await transfer({ from_account_id: from, to_account_id: randomUUID(), amount: '1', reference_id: 'T' });

    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error.code).toBe('DESTINATION_ACCOUNT_NOT_FOUND');
    await expectConsistentBalance(from, '100.00');
    expect(await prisma.transfer.count()).toBe(0);
  });

  it('rejects transfers to the same account', async () => {
    const { from } = await fundedPair();

    const res = await transfer({ from_account_id: from, to_account_id: from, amount: '1', reference_id: 'T' });

    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('SAME_ACCOUNT_TRANSFER');
    await expectConsistentBalance(from, '100.00');
  });

  it.each([
    ['a malformed source id', { from_account_id: 'x' }, 'from_account_id'],
    ['a missing destination', { to_account_id: undefined }, 'to_account_id'],
    ['a zero amount', { amount: '0.00' }, 'amount'],
    ['a negative amount', { amount: '-1' }, 'amount'],
    ['three decimals', { amount: '1.001' }, 'amount'],
    ['a missing reference', { reference_id: undefined }, 'reference_id'],
    ['an unknown field', { fee: '1.00' }, 'body'],
    ['a NUL byte in the description', { description: 'a\u0000b' }, 'description'],
  ])('rejects %s', async (_label, override, field) => {
    const { from, to } = await fundedPair();
    const body = { from_account_id: from, to_account_id: to, amount: '10.00', reference_id: 'T', ...override };

    const res = await transfer(body).expect(400);

    expect((res.body as ErrorBody).error.details?.map((d) => d.field)).toContain(field);
    await expectNothingTransferred(from, to);
  });

  it('processes a transfer reference only once', async () => {
    const { from, to } = await fundedPair();
    const body = { from_account_id: from, to_account_id: to, amount: '30.00', reference_id: 'ONCE' };

    await transfer(body).expect(201);
    const retry = await transfer(body).expect(409);

    expect((retry.body as ErrorBody).error.code).toBe('DUPLICATE_TRANSFER');
    expect(await prisma.transfer.count()).toBe(1);
    await expectConsistentBalance(from, '70.00');
    await expectConsistentBalance(to, '30.00');
  });

  it('reports a retried transfer as a duplicate even after the source is drained', async () => {
    const { from, to } = await fundedPair('30.00');
    const body = { from_account_id: from, to_account_id: to, amount: '30.00', reference_id: 'DRAIN' };

    await transfer(body).expect(201);
    const retry = await transfer(body).expect(409);

    expect((retry.body as ErrorBody).error.code).toBe('DUPLICATE_TRANSFER');
  });

  it('processes concurrent duplicate transfer requests only once', async () => {
    const { from, to } = await fundedPair();
    const body = { from_account_id: from, to_account_id: to, amount: '10.00', reference_id: 'RACE' };

    const responses = await Promise.all(Array.from({ length: 8 }, () => transfer(body)));

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => (r.body as ErrorBody).error?.code === 'DUPLICATE_TRANSFER')).toHaveLength(7);
    await expectConsistentBalance(from, '90.00');
    await expectConsistentBalance(to, '10.00');
  });

  it('does not let a transfer reference collide with ordinary transaction references', async () => {
    const { from, to } = await fundedPair();
    await postTransaction(to, { type: 'credit', amount: '1.00', reference_id: 'SHARED' }).expect(201);

    await transfer({ from_account_id: from, to_account_id: to, amount: '5.00', reference_id: 'SHARED' }).expect(201);

    await expectConsistentBalance(to, '6.00');
  });

  describe('rollback', () => {
    it('rolls back everything when the failure happens after the debit but before the credit', async () => {
      const { from, to } = await fundedPair();

      // Fails when the destination balance is about to be credited: by then the
      // transfer row, the source debit and the debit ledger entry already exist.
      await withFailingTrigger(
        { table: 'accounts', timing: 'BEFORE UPDATE', condition: 'NEW.balance > OLD.balance' },
        async () => {
          await transfer({ from_account_id: from, to_account_id: to, amount: '40.00', reference_id: 'MID' }).expect(
            500,
          );
        },
      );

      await expectNothingTransferred(from, to);
    });

    it('rolls back everything when the credit ledger entry fails', async () => {
      const { from, to } = await fundedPair();

      await withFailingTrigger(
        {
          table: 'transactions',
          timing: 'AFTER INSERT',
          condition: "NEW.type = 'CREDIT' AND NEW.transfer_id IS NOT NULL",
        },
        async () => {
          await transfer({ from_account_id: from, to_account_id: to, amount: '40.00', reference_id: 'CR' }).expect(500);
        },
      );

      await expectNothingTransferred(from, to);
    });

    it('rolls back everything when the debit side fails', async () => {
      const { from, to } = await fundedPair();

      await withFailingTrigger(
        {
          table: 'transactions',
          timing: 'AFTER INSERT',
          condition: "NEW.type = 'DEBIT' AND NEW.transfer_id IS NOT NULL",
        },
        async () => {
          await transfer({ from_account_id: from, to_account_id: to, amount: '40.00', reference_id: 'DR' }).expect(500);
        },
      );

      await expectNothingTransferred(from, to);
    });

    it('allows the same reference to be retried after a rolled-back transfer', async () => {
      const { from, to } = await fundedPair();
      const body = { from_account_id: from, to_account_id: to, amount: '40.00', reference_id: 'RETRY' };

      await withFailingTrigger({ table: 'transactions', timing: 'AFTER INSERT' }, async () => {
        await transfer(body).expect(500);
      });
      await transfer(body).expect(201);

      await expectConsistentBalance(from, '60.00');
      await expectConsistentBalance(to, '40.00');
    });
  });

  describe('concurrency', () => {
    it('never lets concurrent transfers overspend the source', async () => {
      const { from, to } = await fundedPair();

      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          transfer({ from_account_id: from, to_account_id: to, amount: '30.00', reference_id: `C-${i}` }),
        ),
      );

      expect(responses.filter((r) => r.status === 201)).toHaveLength(3);
      expect(responses.filter((r) => r.status === 409)).toHaveLength(3);
      await expectConsistentBalance(from, '10.00');
      await expectConsistentBalance(to, '90.00');
    });

    it('lets concurrent debits and transfers on the same source compete safely', async () => {
      const { from, to } = await fundedPair();

      const responses = await Promise.all([
        transfer({ from_account_id: from, to_account_id: to, amount: '80.00', reference_id: 'X-1' }),
        postTransaction(from, { type: 'debit', amount: '80.00', reference_id: 'X-2' }),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      await expectConsistentBalance(from, '20.00');
    });

    it('completes opposing transfers (A->B and B->A) without deadlocking', async () => {
      const a = await createAccount('A');
      const b = await createAccount('B');
      await credit(a, '100.00');
      await credit(b, '100.00');

      const responses = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          transfer({
            from_account_id: i % 2 === 0 ? a : b,
            to_account_id: i % 2 === 0 ? b : a,
            amount: '5.00',
            reference_id: `OPP-${i}`,
          }),
        ),
      );

      expect(responses.map((r) => r.status)).toEqual(Array(20).fill(201));
      await expectConsistentBalance(a, '100.00');
      await expectConsistentBalance(b, '100.00');
    });
  });
});
