import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { openApiDocument } from './docs/openapi.js';
import { sendSuccess } from './lib/http.js';
import { prisma } from './lib/prisma.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { accountRouter } from './modules/accounts/account.routes.js';
import { transferRouter } from './modules/transfers/transfer.routes.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('query parser', 'simple');

  // Swagger UI ships inline assets that the strict default CSP would block, so
  // it is mounted before helmet. API routes below get the full helmet defaults.
  app.get('/api-docs.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'Ledger API docs' }));

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    sendSuccess(res, { status: 'ok' });
  });

  app.use('/api/accounts', accountRouter);
  app.use('/api/transfers', transferRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
