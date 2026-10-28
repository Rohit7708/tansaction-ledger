import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

interface BodyParserError {
  type: string;
  status: number;
}

const isBodyParserError = (err: unknown): err is BodyParserError =>
  typeof err === 'object' &&
  err !== null &&
  'type' in err &&
  typeof err.type === 'string' &&
  'status' in err &&
  typeof err.status === 'number';

/** Converts any thrown value into an AppError that is safe to expose. */
function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) {
    return err;
  }

  if (isBodyParserError(err)) {
    switch (err.type) {
      case 'entity.parse.failed':
        return new AppError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
      case 'entity.too.large':
        return new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
      case 'encoding.unsupported':
      case 'charset.unsupported':
        return new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The request body encoding is not supported.');
      default:
        return null;
    }
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      // Unique constraint violations that a service did not translate itself.
      case 'P2002':
        return new AppError(409, 'CONFLICT', 'The request conflicts with an existing record.');
      // Write conflict or deadlock: the operation was rolled back and can be retried.
      case 'P2034':
        return new AppError(409, 'CONFLICT', 'The operation conflicted with a concurrent request. Please retry.');
      // The database transaction could not start or finish in time (e.g. heavy lock
      // contention). It was rolled back, so the client can safely retry.
      case 'P2028':
        return new AppError(503, 'SERVICE_UNAVAILABLE', 'The server is busy. Please retry the request.');
      default:
        return null;
    }
  }

  return null;
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.baseUrl}${req.path} does not exist.`));
};

export const methodNotAllowed: RequestHandler = (req, _res, next) => {
  next(new AppError(405, 'METHOD_NOT_ALLOWED', `Method ${req.method} is not allowed on ${req.baseUrl}${req.path}.`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const appError = toAppError(err);

  if (appError) {
    res.status(appError.statusCode).json({
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
      },
    });
    return;
  }

  // Unexpected: log full details server-side, return a generic message to the client.
  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
  });

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
  });
};
