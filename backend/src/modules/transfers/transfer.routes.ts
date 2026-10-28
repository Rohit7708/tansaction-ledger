import { Router } from 'express';
import { methodNotAllowed } from '../../middleware/error-handler.js';
import { transferController } from './transfer.controller.js';

export const transferRouter = Router();

transferRouter.route('/').post(transferController.create).all(methodNotAllowed);
