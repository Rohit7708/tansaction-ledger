import { Router } from 'express';
import { methodNotAllowed } from '../../middleware/error-handler.js';
import { transactionController } from './transaction.controller.js';

// Transactions are append-only: only create and read are exposed. There are
// deliberately no PUT/PATCH/DELETE handlers, and unsupported methods return 405.
export const transactionRouter = Router({ mergeParams: true });

transactionRouter.route('/').get(transactionController.list).post(transactionController.create).all(methodNotAllowed);
