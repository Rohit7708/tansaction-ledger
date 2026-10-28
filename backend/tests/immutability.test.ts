import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openApiDocument } from '../src/docs/openapi.js';
import { prisma } from '../src/lib/prisma.js';
import { api, createAccount, credit, type ErrorBody, expectConsistentBalance, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('transaction immutability', () => {
  it('exposes no update or delete methods for transactions', async () => {
    const id = await createAccount();
    await credit(id, '100.00');
    const tx = await prisma.transaction.findFirstOrThrow({ where: { accountId: id } });
    const collection = `/api/accounts/${id}/transactions`;
    const item = `${collection}/${tx.id}`;

    for (const method of ['put', 'patch', 'delete'] as const) {
      const onCollection = await api()[method](collection).send({ amount: '1.00' });
      expect(onCollection.status).toBe(405);
      expect((onCollection.body as ErrorBody).error.code).toBe('METHOD_NOT_ALLOWED');

      const onItem = await api()[method](item).send({ amount: '1.00' });
      expect(onItem.status).toBe(404);
      expect((onItem.body as ErrorBody).error.code).toBe('ROUTE_NOT_FOUND');
    }

    const unchanged = await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(unchanged).toEqual(tx);
    await expectConsistentBalance(id, '100.00');
  });

  it('does not allow accounts (and so balances) to be edited or deleted via the API', async () => {
    const id = await createAccount();

    for (const method of ['put', 'patch', 'delete'] as const) {
      const res = await api()[method](`/api/accounts/${id}`).send({ balance: '999.00' });
      expect(res.status).toBe(405);
    }
    await expectConsistentBalance(id, '0.00');
  });

  it('documents only create and read operations for transactions', () => {
    const paths = openApiDocument.paths as Record<string, Record<string, unknown>>;
    for (const [path, operations] of Object.entries(paths)) {
      if (path.includes('transactions')) {
        expect(Object.keys(operations).sort()).toEqual(['get', 'post']);
      }
    }
  });

  it('rejects UPDATE and DELETE of ledger rows at the database level', async () => {
    const id = await createAccount();
    await credit(id, '100.00');
    const tx = await prisma.transaction.findFirstOrThrow({ where: { accountId: id } });

    await expect(prisma.transaction.update({ where: { id: tx.id }, data: { amount: '1.00' } })).rejects.toThrow(
      /immutable/,
    );
    await expect(prisma.transaction.delete({ where: { id: tx.id } })).rejects.toThrow(/immutable/);
    await expect(prisma.$executeRaw`UPDATE transactions SET description = 'edited'`).rejects.toThrow(/immutable/);

    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).toEqual(tx);
  });
});
