import type { Request, Response } from 'express';
import { sendSuccess } from '../../lib/http.js';
import { parseInput } from '../../lib/validation.js';
import { createTransferSchema } from './transfer.schemas.js';
import { toTransferResultDto } from './transfer.serializer.js';
import { transferService } from './transfer.service.js';

export const transferController = {
  async create(req: Request, res: Response): Promise<void> {
    const input = parseInput(createTransferSchema, req.body);
    const result = await transferService.create(input);
    sendSuccess(res, toTransferResultDto(result), 201);
  },
};
