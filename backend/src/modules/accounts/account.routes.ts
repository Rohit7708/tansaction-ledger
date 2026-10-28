import { Router } from 'express';
import { methodNotAllowed } from '../../middleware/error-handler.js';
import { transactionRouter } from '../transactions/transaction.routes.js';
import { accountController } from './account.controller.js';

export const accountRouter = Router();

accountRouter.route('/').get(accountController.list).post(accountController.create).all(methodNotAllowed);
accountRouter.route('/:accountId').get(accountController.getById).all(methodNotAllowed);
accountRouter.use('/:accountId/transactions', transactionRouter);
