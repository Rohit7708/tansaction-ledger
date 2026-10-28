import { z } from 'zod';
import { descriptionSchema, moneyAmountSchema, referenceIdSchema, requiredString } from '../../lib/validation.js';

/** Ledger entries created by transfers use this prefix; clients may not use it. */
export const TRANSFER_REFERENCE_PREFIX = 'transfer:';

export const createTransactionSchema = z.strictObject(
  {
    type: z.enum(['credit', 'debit'], {
      error: (issue) => (issue.input === undefined ? 'type is required' : 'type must be either "credit" or "debit"'),
    }),
    amount: moneyAmountSchema,
    description: descriptionSchema,
    reference_id: referenceIdSchema.refine(
      (value) => !value.toLowerCase().startsWith(TRANSFER_REFERENCE_PREFIX),
      `reference_id must not start with the reserved prefix "${TRANSFER_REFERENCE_PREFIX}"`,
    ),
  },
  { error: (issue) => (issue.code === 'unrecognized_keys' ? undefined : 'Request body must be a JSON object') },
);

export type CreateTransactionInput = z.output<typeof createTransactionSchema>;

export const PAGE_SIZE_DEFAULT = 10;
export const PAGE_SIZE_MAX = 100;

const positiveIntegerParam = (field: string, defaultValue: number) =>
  requiredString(field)
    .regex(/^\d+$/, `${field} must be a positive integer`)
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, `${field} must be a positive integer`)
        .max(Number.MAX_SAFE_INTEGER, `${field} is too large`),
    )
    .optional()
    .transform((value) => value ?? defaultValue);

export const paginationQuerySchema = z.object({
  page: positiveIntegerParam('page', 1),
  limit: positiveIntegerParam('limit', PAGE_SIZE_DEFAULT).pipe(
    z.number().max(PAGE_SIZE_MAX, `limit must not exceed ${PAGE_SIZE_MAX}`),
  ),
});

export type PaginationQuery = z.output<typeof paginationQuerySchema>;
