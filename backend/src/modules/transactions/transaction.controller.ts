import type { Request, Response } from 'express';
import { sendSuccess } from '../../lib/http.js';
import { accountIdParamsSchema, parseInput } from '../../lib/validation.js';
import { toAccountDto } from '../accounts/account.serializer.js';
import { createTransactionSchema, paginationQuerySchema } from './transaction.schemas.js';
import { toTransactionDto } from './transaction.serializer.js';
import { transactionService } from './transaction.service.js';

const parseAccountId = (params: unknown): string =>
  parseInput(accountIdParamsSchema, params, 'INVALID_ACCOUNT_ID', 'The account ID is invalid.').accountId;

export const transactionController = {
  async create(req: Request, res: Response): Promise<void> {
    const accountId = parseAccountId(req.params);
    const input = parseInput(createTransactionSchema, req.body);
    const { transaction, account } = await transactionService.create(accountId, input);
    sendSuccess(res, { transaction: toTransactionDto(transaction), account: toAccountDto(account) }, 201);
  },

  async list(req: Request, res: Response): Promise<void> {
    const accountId = parseAccountId(req.params);
    const query = parseInput(
      paginationQuerySchema,
      req.query,
      'INVALID_PAGINATION',
      'The pagination parameters are invalid.',
    );
    const result = await transactionService.list(accountId, query);
    res.status(200).json({
      success: true,
      data: result.items.map(toTransactionDto),
      pagination: {
        current_page: result.page,
        page_size: result.limit,
        total_records: result.total,
        total_pages: result.totalPages,
      },
    });
  },
};
