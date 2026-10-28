import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { api, createAccount, credit, type ErrorBody, resetDatabase } from './helpers.js';

interface TxRow {
  id: string;
  account_id: string;
  reference_id: string;
  created_at: string;
}

let accountId: string;
let otherAccountId: string;

beforeAll(async () => {
  await resetDatabase();
  accountId = await createAccount('Paged');
  otherAccountId = await createAccount('Other');
  // 25 ledger rows one second apart so the expected order is unambiguous.
  const base = Date.parse('2026-01-01T00:00:00.000Z');
  for (let i = 1; i <= 25; i++) {
    await prisma.transaction.create({
      data: {
        accountId,
        type: 'CREDIT',
        amount: '1.00',
        referenceId: `P-${String(i).padStart(2, '0')}`,
        createdAt: new Date(base + i * 1000),
      },
    });
  }
  await credit(otherAccountId, '5.00');
});

afterAll(() => prisma.$disconnect());

const getPage = (query: string, id = accountId) => api().get(`/api/accounts/${id}/transactions${query}`);

describe('GET /api/accounts/:accountId/transactions', () => {
  it('defaults to page 1 with 10 records, newest first', async () => {
    const res = await getPage('').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.pagination).toEqual({ current_page: 1, page_size: 10, total_records: 25, total_pages: 3 });
    expect(res.body.data).toHaveLength(10);
    expect(res.body.data[0].reference_id).toBe('P-25');
    expect(res.body.data[9].reference_id).toBe('P-16');
  });

  it('returns subsequent and partial pages', async () => {
    const page2 = await getPage('?page=2&limit=10').expect(200);
    const page3 = await getPage('?page=3&limit=10').expect(200);

    expect(page2.body.data.map((t: TxRow) => t.reference_id)[0]).toBe('P-15');
    expect(page3.body.data).toHaveLength(5);
    expect(page3.body.data.at(-1).reference_id).toBe('P-01');
    expect(page3.body.pagination).toEqual({ current_page: 3, page_size: 10, total_records: 25, total_pages: 3 });
  });

  it('returns every record exactly once across pages', async () => {
    const ids = new Set<string>();
    for (let page = 1; page <= 4; page++) {
      const res = await getPage(`?page=${page}&limit=7`).expect(200);
      for (const tx of res.body.data as TxRow[]) {
        ids.add(tx.id);
      }
    }
    expect(ids.size).toBe(25);
  });

  it('sorts by created_at descending', async () => {
    const res = await getPage('?limit=100').expect(200);
    const times = (res.body.data as TxRow[]).map((t) => Date.parse(t.created_at));

    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('returns only transactions of the requested account', async () => {
    const res = await getPage('?limit=100').expect(200);

    expect((res.body.data as TxRow[]).every((t) => t.account_id === accountId)).toBe(true);
    const other = await getPage('', otherAccountId).expect(200);
    expect(other.body.pagination.total_records).toBe(1);
  });

  it('returns an empty page beyond the last page', async () => {
    const res = await getPage('?page=4&limit=10').expect(200);

    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({ current_page: 4, page_size: 10, total_records: 25, total_pages: 3 });
  });

  it('handles accounts with no transactions', async () => {
    const empty = await createAccount('Empty');

    const res = await getPage('', empty).expect(200);

    expect(res.body).toEqual({
      success: true,
      data: [],
      pagination: { current_page: 1, page_size: 10, total_records: 0, total_pages: 0 },
    });
  });

  it('allows the maximum page size of 100', async () => {
    const res = await getPage('?limit=100').expect(200);
    expect(res.body.pagination.page_size).toBe(100);
    expect(res.body.data).toHaveLength(25);
  });

  it('orders deterministically by id when timestamps are identical', async () => {
    const tied = await createAccount('Tied');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    // Inserted directly so that all rows share exactly the same timestamp.
    for (let i = 0; i < 6; i++) {
      await prisma.transaction.create({
        data: { accountId: tied, type: 'CREDIT', amount: '1.00', referenceId: `TIE-${i}`, createdAt },
      });
    }

    const first = await getPage('?limit=3', tied).expect(200);
    const second = await getPage('?page=2&limit=3', tied).expect(200);
    const ids = [...first.body.data, ...second.body.data].map((t: TxRow) => t.id);

    expect(ids).toEqual([...ids].sort().reverse());
    expect(new Set(ids).size).toBe(6);
    const again = await getPage('?limit=3', tied).expect(200);
    expect(again.body.data.map((t: TxRow) => t.id)).toEqual(ids.slice(0, 3));
  });

  it('returns metadata consistent with the returned rows while transactions are being written', async () => {
    const busy = await createAccount('Busy');
    const writes = Array.from({ length: 40 }, (_, i) =>
      api()
        .post(`/api/accounts/${busy}/transactions`)
        .send({ type: 'credit', amount: '1.00', reference_id: `W-${i}` }),
    );
    const reads = Array.from({ length: 40 }, () => getPage('?limit=100', busy));

    const responses = await Promise.all([...writes, ...reads]);

    for (const res of responses.slice(writes.length)) {
      expect(res.status).toBe(200);
      // count and rows must come from the same snapshot
      expect(res.body.data).toHaveLength(Math.min(100, res.body.pagination.total_records));
    }
  });

  it.each([
    ['page=0', 'page'],
    ['page=-1', 'page'],
    ['page=1.5', 'page'],
    ['page=abc', 'page'],
    ['page=', 'page'],
    ['page=1&page=2', 'page'],
    ['limit=0', 'limit'],
    ['limit=-5', 'limit'],
    ['limit=ten', 'limit'],
    ['limit=101', 'limit'],
    ['limit=1000000', 'limit'],
  ])('rejects %s', async (query, field) => {
    const res = await getPage(`?${query}`).expect(400);
    const error = (res.body as ErrorBody).error;

    expect(error.code).toBe('INVALID_PAGINATION');
    expect(error.details?.map((d) => d.field)).toContain(field);
  });

  it('returns 404 for a nonexistent account', async () => {
    const res = await getPage('', randomUUID()).expect(404);
    expect((res.body as ErrorBody).error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('returns 400 for a malformed account id', async () => {
    const res = await getPage('', 'nope').expect(400);
    expect((res.body as ErrorBody).error.code).toBe('INVALID_ACCOUNT_ID');
  });
});
