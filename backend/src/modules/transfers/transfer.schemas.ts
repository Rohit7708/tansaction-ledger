import { z } from 'zod';
import { descriptionSchema, moneyAmountSchema, referenceIdSchema, uuidSchema } from '../../lib/validation.js';

export const createTransferSchema = z.strictObject(
  {
    from_account_id: uuidSchema('from_account_id'),
    to_account_id: uuidSchema('to_account_id'),
    amount: moneyAmountSchema,
    reference_id: referenceIdSchema,
    description: descriptionSchema,
  },
  { error: (issue) => (issue.code === 'unrecognized_keys' ? undefined : 'Request body must be a JSON object') },
);

export type CreateTransferInput = z.output<typeof createTransferSchema>;
