import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  // Query errors are not logged here: expected ones (e.g. duplicate references) are
  // translated by services, unexpected ones are logged by the error middleware.
  log: ['warn'],
  // Financial operations wait on row locks under contention; allow enough time
  // for queued requests to acquire a connection and finish.
  transactionOptions: {
    maxWait: 10_000,
    timeout: 15_000,
  },
});

export type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
