import type { Request, Response } from 'express';
import { sendSuccess } from '../../lib/http.js';
import { accountIdParamsSchema, parseInput } from '../../lib/validation.js';
import { createAccountSchema } from './account.schemas.js';
import { toAccountDto } from './account.serializer.js';
import { accountService } from './account.service.js';

export const accountController = {
  async create(req: Request, res: Response): Promise<void> {
    const input = parseInput(createAccountSchema, req.body);
    const account = await accountService.create(input);
    sendSuccess(res, toAccountDto(account), 201);
  },

  async list(_req: Request, res: Response): Promise<void> {
    const accounts = await accountService.list();
    sendSuccess(res, accounts.map(toAccountDto));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { accountId } = parseInput(
      accountIdParamsSchema,
      req.params,
      'INVALID_ACCOUNT_ID',
      'The account ID is invalid.',
    );
    const account = await accountService.getById(accountId);
    sendSuccess(res, toAccountDto(account));
  },
};
