import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (docs at /api-docs)`);
});

function shutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down`);
  server.close(() => {
    prisma
      .$disconnect()
      .catch((err: unknown) => logger.error('Error while disconnecting Prisma', { error: String(err) }))
      .finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
