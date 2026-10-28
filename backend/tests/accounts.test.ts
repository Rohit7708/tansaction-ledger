import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { api, createAccount, type ErrorBody, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('POST /api/accounts', () => {
  it('creates an account with a zero balance and trims the name', async () => {
    const res = await api().post('/api/accounts').send({ name: '  John Doe  ' }).expect(201);

    expect(res.body).toMatchObject({ success: true, data: { name: 'John Doe', balance: '0.00' } });
    expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(res.body.data.created_at).toString()).not.toBe('Invalid Date');
  });

  it.each([
    ['missing name', {}],
    ['empty name', { name: '' }],
    ['whitespace-only name', { name: '   ' }],
    ['non-string name', { name: 42 }],
    ['name over 100 characters', { name: 'x'.repeat(101) }],
    ['a NUL byte in the name', { name: 'a\u0000b' }],
    ['a control character in the name', { name: 'line\nbreak' }],
    ['an unpaired UTF-16 surrogate in the name', { name: 'bad\ud800' }],
  ])('rejects %s', async (_label, body) => {
    const res = await api().post('/api/accounts').send(body).expect(400);
    const error = (res.body as ErrorBody).error;

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details?.[0]?.field).toBe('name');
    expect(await prisma.account.count()).toBe(0);
  });

  it('rejects a client-supplied balance', async () => {
    const res = await api().post('/api/accounts').send({ name: 'Rich', balance: '1000000.00' }).expect(400);

    expect((res.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.account.count()).toBe(0);
  });

  it('rejects a body that is not a JSON object', async () => {
    const res = await api().post('/api/accounts').send(['John']).expect(400);
    expect((res.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed JSON', async () => {
    const res = await api().post('/api/accounts').set('Content-Type', 'application/json').send('{"name":').expect(400);
    expect((res.body as ErrorBody).error.code).toBe('INVALID_JSON');
  });

  it('rejects oversized request bodies', async () => {
    const res = await api()
      .post('/api/accounts')
      .send({ name: 'x'.repeat(20_000) })
      .expect(413);
    expect((res.body as ErrorBody).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('enforces non-blank names and non-negative balances in the database itself', async () => {
    await expect(prisma.account.create({ data: { name: '   ' } })).rejects.toThrow(/accounts_name_not_blank/);
    await expect(prisma.account.create({ data: { name: '\t\n ' } })).rejects.toThrow(/accounts_name_not_blank/);
    await expect(prisma.account.create({ data: { name: 'Negative', balance: '-0.01' } })).rejects.toThrow(
      /accounts_balance_non_negative/,
    );
  });
});

describe('GET /api/accounts', () => {
  it('returns an empty list when there are no accounts', async () => {
    const res = await api().get('/api/accounts').expect(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it('returns all accounts, newest first, with balances', async () => {
    await createAccount('First');
    await createAccount('Second');

    const res = await api().get('/api/accounts').expect(200);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((a: { name: string }) => a.name)).toEqual(['Second', 'First']);
    expect(res.body.data[0].balance).toBe('0.00');
  });
});

describe('GET /api/accounts/:accountId', () => {
  it('returns the account with its balance', async () => {
    const id = await createAccount('Alice');

    const res = await api().get(`/api/accounts/${id}`).expect(200);

    expect(res.body.data).toMatchObject({ id, name: 'Alice', balance: '0.00' });
  });

  it('returns 404 for a nonexistent account', async () => {
    const res = await api().get(`/api/accounts/${randomUUID()}`).expect(404);
    expect((res.body as ErrorBody).error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('returns 400 for a malformed account id', async () => {
    const res = await api().get('/api/accounts/not-a-uuid').expect(400);
    expect((res.body as ErrorBody).error.code).toBe('INVALID_ACCOUNT_ID');
  });
});

describe('unknown routes', () => {
  it('return a consistent 404 error body', async () => {
    const res = await api().get('/api/unknown').expect(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: 'Route GET /api/unknown does not exist.' },
    });
  });
});
