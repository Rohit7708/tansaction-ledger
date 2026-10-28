import { randomUUID } from 'node:crypto';
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

describe('POST /api/accounts/:accountId/transactions', () => {
  it('records a credit and increases the balance', async () => {
    const id = await createAccount();

    const res = await postTransaction(id, {
      type: 'credit',
      amount: '100.00',
      description: 'Initial deposit',
      reference_id: 'REF-001',
    }).expect(201);

    expect(res.body.data.transaction).toMatchObject({
      account_id: id,
      type: 'credit',
      amount: '100.00',
      description: 'Initial deposit',
      reference_id: 'REF-001',
      transfer_id: null,
    });
    expect(res.body.data.account.balance).toBe('100.00');
    await expectConsistentBalance(id, '100.00');
  });

  it('records a debit when the balance is sufficient', async () => {
    const id = await createAccount();
    await credit(id, '100.00');

    const res = await postTransaction(id, { type: 'debit', amount: '30.00', reference_id: 'REF-002' }).expect(201);

    expect(res.body.data.transaction).toMatchObject({ type: 'debit', amount: '30.00', description: '' });
    expect(res.body.data.account.balance).toBe('70.00');
    await expectConsistentBalance(id, '70.00');
  });

  it('allows a debit of the entire balance', async () => {
    const id = await createAccount();
    await credit(id, '55.55');

    await postTransaction(id, { type: 'debit', amount: '55.55', reference_id: 'ALL' }).expect(201);

    await expectConsistentBalance(id, '0.00');
  });

  it('rejects a debit larger than the balance without changing anything', async () => {
    const id = await createAccount();
    await credit(id, '50.00');

    const res = await postTransaction(id, { type: 'debit', amount: '50.01', reference_id: 'TOO-MUCH' }).expect(409);

    expect(res.body).toEqual({
      success: false,
      error: { code: 'INSUFFICIENT_BALANCE', message: 'The account does not have sufficient balance.' },
    });
    expect(await countTransactions(id)).toBe(1);
    await expectConsistentBalance(id, '50.00');
  });

  it('does not consume the reference of a rejected debit', async () => {
    const id = await createAccount();

    await postTransaction(id, { type: 'debit', amount: '10.00', reference_id: 'RETRY-1' }).expect(409);
    await credit(id, '10.00');
    await postTransaction(id, { type: 'debit', amount: '10.00', reference_id: 'RETRY-1' }).expect(201);

    await expectConsistentBalance(id, '0.00');
  });

  it('keeps the balance equal to the net of all transactions (100 + 50 - 30 - 20 = 100)', async () => {
    const id = await createAccount();

    await postTransaction(id, { type: 'credit', amount: '100', reference_id: 'A' }).expect(201);
    await postTransaction(id, { type: 'credit', amount: '50', reference_id: 'B' }).expect(201);
    await postTransaction(id, { type: 'debit', amount: '30', reference_id: 'C' }).expect(201);
    await postTransaction(id, { type: 'debit', amount: '20', reference_id: 'D' }).expect(201);

    await expectConsistentBalance(id, '100.00');
  });

  it('uses exact decimal arithmetic (0.10 + 0.20 = 0.30)', async () => {
    const id = await createAccount();

    await postTransaction(id, { type: 'credit', amount: '0.10', reference_id: 'A' }).expect(201);
    await postTransaction(id, { type: 'credit', amount: '0.20', reference_id: 'B' }).expect(201);
    await postTransaction(id, { type: 'debit', amount: '0.30', reference_id: 'C' }).expect(201);

    await expectConsistentBalance(id, '0.00');
  });

  it('accepts JSON numbers and normalizes them to two decimals', async () => {
    const id = await createAccount();

    const res = await postTransaction(id, { type: 'credit', amount: 12.5, reference_id: 'NUM' }).expect(201);

    expect(res.body.data.transaction.amount).toBe('12.50');
  });

  describe('validation', () => {
    it.each([
      ['an unknown type', { type: 'refund', amount: '10.00', reference_id: 'R' }, 'type'],
      ['an uppercase type', { type: 'CREDIT', amount: '10.00', reference_id: 'R' }, 'type'],
      ['a missing type', { amount: '10.00', reference_id: 'R' }, 'type'],
      ['a zero amount', { type: 'credit', amount: '0', reference_id: 'R' }, 'amount'],
      ['a zero amount with decimals', { type: 'credit', amount: '0.00', reference_id: 'R' }, 'amount'],
      ['a negative amount', { type: 'credit', amount: '-10.00', reference_id: 'R' }, 'amount'],
      ['a negative numeric amount', { type: 'credit', amount: -5, reference_id: 'R' }, 'amount'],
      ['three decimal places', { type: 'credit', amount: '10.001', reference_id: 'R' }, 'amount'],
      ['a non-numeric amount', { type: 'credit', amount: 'ten', reference_id: 'R' }, 'amount'],
      ['an exponent amount', { type: 'credit', amount: '1e3', reference_id: 'R' }, 'amount'],
      ['an empty amount', { type: 'credit', amount: '', reference_id: 'R' }, 'amount'],
      ['an "Infinity" amount', { type: 'credit', amount: 'Infinity', reference_id: 'R' }, 'amount'],
      ['a "NaN" amount', { type: 'credit', amount: 'NaN', reference_id: 'R' }, 'amount'],
      ['a hex amount', { type: 'credit', amount: '0x10', reference_id: 'R' }, 'amount'],
      ['a leading-zero amount', { type: 'credit', amount: '007', reference_id: 'R' }, 'amount'],
      ['an excessively large amount', { type: 'credit', amount: '1000000000.01', reference_id: 'R' }, 'amount'],
      ['a huge numeric amount', { type: 'credit', amount: 1e21, reference_id: 'R' }, 'amount'],
      ['a missing amount', { type: 'credit', reference_id: 'R' }, 'amount'],
      ['a missing reference_id', { type: 'credit', amount: '10.00' }, 'reference_id'],
      ['an empty reference_id', { type: 'credit', amount: '10.00', reference_id: '' }, 'reference_id'],
      ['a whitespace reference_id', { type: 'credit', amount: '10.00', reference_id: '   ' }, 'reference_id'],
      ['a reference_id with spaces inside', { type: 'credit', amount: '1', reference_id: 'A B' }, 'reference_id'],
      ['a too-long reference_id', { type: 'credit', amount: '1', reference_id: 'R'.repeat(101) }, 'reference_id'],
      ['a reserved transfer: reference', { type: 'credit', amount: '1', reference_id: 'transfer:X' }, 'reference_id'],
      ['a non-string description', { type: 'credit', amount: '1', reference_id: 'R', description: 5 }, 'description'],
      [
        'a too-long description',
        { type: 'credit', amount: '1', reference_id: 'R', description: 'd'.repeat(256) },
        'description',
      ],
      [
        'a NUL byte in the description',
        { type: 'credit', amount: '1', reference_id: 'R', description: 'a\u0000b' },
        'description',
      ],
      [
        'an unpaired surrogate in the description',
        { type: 'credit', amount: '1', reference_id: 'R', description: '\udc00' },
        'description',
      ],
      ['a client-supplied balance', { type: 'credit', amount: '1', reference_id: 'R', balance: '999' }, 'body'],
      ['a client-supplied created_at', { type: 'credit', amount: '1', reference_id: 'R', created_at: 'x' }, 'body'],
    ])('rejects %s', async (_label, body, field) => {
      const id = await createAccount();

      const res = await postTransaction(id, body as Parameters<typeof postTransaction>[1]).expect(400);
      const error = (res.body as ErrorBody).error;

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details?.map((d) => d.field)).toContain(field);
      expect(await countTransactions(id)).toBe(0);
      await expectConsistentBalance(id, '0.00');
    });

    it('rejects a malformed account id', async () => {
      const res = await postTransaction('123', { type: 'credit', amount: '1', reference_id: 'R' }).expect(400);
      expect((res.body as ErrorBody).error.code).toBe('INVALID_ACCOUNT_ID');
    });

    it('rejects transactions for a nonexistent account', async () => {
      const res = await postTransaction(randomUUID(), { type: 'credit', amount: '1', reference_id: 'R' }).expect(404);

      expect((res.body as ErrorBody).error.code).toBe('ACCOUNT_NOT_FOUND');
      expect(await prisma.transaction.count()).toBe(0);
    });
  });

  describe('duplicate references', () => {
    it('rejects a duplicate reference on the same account without changing the balance', async () => {
      const id = await createAccount();
      await postTransaction(id, { type: 'credit', amount: '100.00', reference_id: 'DUP' }).expect(201);

      const res = await postTransaction(id, { type: 'credit', amount: '100.00', reference_id: 'DUP' }).expect(409);

      expect((res.body as ErrorBody).error.code).toBe('DUPLICATE_TRANSACTION');
      expect(await countTransactions(id)).toBe(1);
      await expectConsistentBalance(id, '100.00');
    });

    it('treats a duplicate reference as a duplicate even if the type or amount differs', async () => {
      const id = await createAccount();
      await postTransaction(id, { type: 'credit', amount: '100.00', reference_id: 'DUP' }).expect(201);

      await postTransaction(id, { type: 'debit', amount: '5.00', reference_id: 'DUP' }).expect(409);

      await expectConsistentBalance(id, '100.00');
    });

    it('reports a duplicate (not insufficient balance) when a successful debit is retried', async () => {
      const id = await createAccount();
      await credit(id, '80.00');
      await postTransaction(id, { type: 'debit', amount: '80.00', reference_id: 'PAY-1' }).expect(201);

      const res = await postTransaction(id, { type: 'debit', amount: '80.00', reference_id: 'PAY-1' }).expect(409);

      expect((res.body as ErrorBody).error.code).toBe('DUPLICATE_TRANSACTION');
      await expectConsistentBalance(id, '0.00');
    });

    it('allows the same reference on different accounts', async () => {
      const first = await createAccount('First');
      const second = await createAccount('Second');

      await postTransaction(first, { type: 'credit', amount: '10.00', reference_id: 'SHARED' }).expect(201);
      await postTransaction(second, { type: 'credit', amount: '20.00', reference_id: 'SHARED' }).expect(201);

      await expectConsistentBalance(first, '10.00');
      await expectConsistentBalance(second, '20.00');
    });

    it('is enforced by a database unique constraint', async () => {
      const id = await createAccount();
      await credit(id, '1.00');
      const existing = await prisma.transaction.findFirstOrThrow({ where: { accountId: id } });

      await expect(
        prisma.transaction.create({
          data: { accountId: id, type: 'CREDIT', amount: '1.00', referenceId: existing.referenceId },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  it('rejects whitespace-only references in the database itself', async () => {
    const id = await createAccount();

    await expect(
      prisma.transaction.create({ data: { accountId: id, type: 'CREDIT', amount: '1.00', referenceId: '\t\n' } }),
    ).rejects.toThrow(/transactions_reference_id_not_blank/);
  });

  it('enforces a positive amount in the database itself', async () => {
    const id = await createAccount();

    await expect(
      prisma.transaction.create({ data: { accountId: id, type: 'CREDIT', amount: '0', referenceId: 'ZERO' } }),
    ).rejects.toThrow(/transactions_amount_positive/);
  });
});
