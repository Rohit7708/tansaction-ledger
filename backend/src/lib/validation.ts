import { z } from 'zod';
import { AppError, type ErrorCode } from './errors.js';
import { MAX_TRANSACTION_AMOUNT, MONEY_PATTERN, toDecimal } from './money.js';

/**
 * Parses untrusted input with a Zod schema and converts failures into a 400
 * AppError carrying one entry per invalid field.
 */
export function parseInput<T extends z.ZodType>(
  schema: T,
  input: unknown,
  code: ErrorCode = 'VALIDATION_ERROR',
  message = 'The request contains invalid data.',
): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : 'body',
    message: issue.message,
  }));
  throw new AppError(400, code, message, details);
}

export const requiredString = (field: string) =>
  z.string({
    error: (issue) => (issue.input === undefined ? `${field} is required` : `${field} must be a string`),
  });

export const uuidSchema = (field: string) =>
  requiredString(field).pipe(z.uuid({ error: `${field} must be a valid UUID` }));

/**
 * Accepts a positive amount as a decimal string ("100.00") or a JSON number (100).
 * Rejects exponents, more than two fraction digits, zero, negatives and values
 * above MAX_TRANSACTION_AMOUNT. The output is a normalized string, never a float.
 */
export const moneyAmountSchema = z
  .union([z.string(), z.number()], {
    error: (issue) =>
      issue.input === undefined ? 'amount is required' : 'amount must be a decimal string such as "100.00"',
  })
  .transform((raw, ctx) => {
    const value = typeof raw === 'number' ? raw.toString() : raw.trim();
    if (!MONEY_PATTERN.test(value)) {
      ctx.addIssue({
        code: 'custom',
        message: 'amount must be a positive decimal number with at most 2 decimal places',
      });
      return z.NEVER;
    }
    const amount = toDecimal(value);
    if (amount.lte(0)) {
      ctx.addIssue({ code: 'custom', message: 'amount must be greater than zero' });
      return z.NEVER;
    }
    if (amount.gt(MAX_TRANSACTION_AMOUNT)) {
      ctx.addIssue({ code: 'custom', message: `amount must not exceed ${MAX_TRANSACTION_AMOUNT}` });
      return z.NEVER;
    }
    return amount.toFixed(2);
  });

export const REFERENCE_ID_PATTERN = /^[A-Za-z0-9._:/-]*$/;
export const REFERENCE_ID_MAX_LENGTH = 100;

export const referenceIdSchema = requiredString('reference_id')
  .trim()
  .min(1, 'reference_id must not be empty')
  .max(REFERENCE_ID_MAX_LENGTH, `reference_id must be at most ${REFERENCE_ID_MAX_LENGTH} characters`)
  .regex(REFERENCE_ID_PATTERN, 'reference_id may only contain letters, digits and . _ : / -');

/**
 * Free text must be storable and displayable: PostgreSQL rejects NUL bytes, and an
 * unpaired UTF-16 surrogate cannot be encoded as UTF-8. Both would otherwise surface
 * as a 500 from the database, so they (and other control characters) are rejected here.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export const isPlainText = (value: string): boolean => !CONTROL_CHARACTER.test(value) && !LONE_SURROGATE.test(value);

export const plainTextMessage = (field: string) => `${field} must not contain control characters or invalid Unicode`;

export const DESCRIPTION_MAX_LENGTH = 255;

export const descriptionSchema = z
  .string({ error: 'description must be a string' })
  .trim()
  .max(DESCRIPTION_MAX_LENGTH, `description must be at most ${DESCRIPTION_MAX_LENGTH} characters`)
  .refine(isPlainText, plainTextMessage('description'))
  .optional()
  .transform((value) => value ?? '');

export const accountIdParamsSchema = z.object({ accountId: uuidSchema('accountId') });

export const ACCOUNT_NAME_MAX_LENGTH = 100;
