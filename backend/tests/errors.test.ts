import { Prisma } from '@prisma/client';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { errorHandler } from '../src/middleware/error-handler.js';

/** Mounts a route that throws `error`, behind the real error middleware. */
function appThrowing(error: unknown) {
  const app = express();
  app.get('/boom', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('simulated', { code, clientVersion: Prisma.prismaVersion.client });

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

describe('error handler mapping', () => {
  it.each([
    ['P2002', 409, 'CONFLICT'],
    ['P2034', 409, 'CONFLICT'],
    ['P2028', 503, 'SERVICE_UNAVAILABLE'],
  ])('maps Prisma %s to %i %s', async (code, status, errorCode) => {
    const res = await request(appThrowing(prismaError(code))).get('/boom');

    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(errorCode);
    expect(JSON.stringify(res.body)).not.toContain('simulated');
  });

  it('hides internal details of unexpected errors', async () => {
    const res = await request(appThrowing(new Error('SELECT secret FROM internals'))).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
    });
  });
});
