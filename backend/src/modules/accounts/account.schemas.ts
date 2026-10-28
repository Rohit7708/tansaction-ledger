import { z } from 'zod';
import { ACCOUNT_NAME_MAX_LENGTH, isPlainText, plainTextMessage, requiredString } from '../../lib/validation.js';

export const createAccountSchema = z.strictObject(
  {
    name: requiredString('name')
      .trim()
      .min(1, 'name must not be empty')
      .max(ACCOUNT_NAME_MAX_LENGTH, `name must be at most ${ACCOUNT_NAME_MAX_LENGTH} characters`)
      .refine(isPlainText, plainTextMessage('name')),
  },
  { error: (issue) => (issue.code === 'unrecognized_keys' ? undefined : 'Request body must be a JSON object') },
);

export type CreateAccountInput = z.output<typeof createAccountSchema>;
