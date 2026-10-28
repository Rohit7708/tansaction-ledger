import { MAX_TRANSACTION_AMOUNT } from '../lib/money.js';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../modules/transactions/transaction.schemas.js';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const errorResponse = (description: string, example: { code: string; message: string }) => ({
  description,
  content: {
    'application/json': {
      schema: ref('ErrorResponse'),
      example: { success: false, error: example },
    },
  },
});

const jsonBody = (schemaName: string, example: Record<string, string>) => ({
  required: true,
  content: { 'application/json': { schema: ref(schemaName), example } },
});

const success = (description: string, dataSchema: object) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: { success: { type: 'boolean', enum: [true] }, data: dataSchema },
      },
    },
  },
});

const accountIdParam = {
  name: 'accountId',
  in: 'path',
  required: true,
  description: 'Account UUID.',
  schema: { type: 'string', format: 'uuid' },
};

const commonErrors = {
  '400': errorResponse('Validation failed (VALIDATION_ERROR, INVALID_JSON, ...).', {
    code: 'VALIDATION_ERROR',
    message: 'The request contains invalid data.',
  }),
  '500': errorResponse('Unexpected server error. No internal details are exposed.', {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred.',
  }),
};

const money = {
  type: 'string',
  pattern: '^\\d+\\.\\d{2}$',
  description: 'Exact decimal serialized as a string with two fraction digits.',
  example: '100.00',
};

const moneyInput = {
  oneOf: [
    { type: 'string', example: '100.00' },
    { type: 'number', example: 100 },
  ],
  description: `Positive amount with at most 2 decimal places, greater than 0 and at most ${MAX_TRANSACTION_AMOUNT}. Strings are recommended; exponents (1e3), signs and more than two decimals are rejected.`,
};

const referenceId = {
  type: 'string',
  minLength: 1,
  maxLength: 100,
  pattern: '^[A-Za-z0-9._:/-]+$',
  description: 'Client-supplied idempotency key. Leading/trailing whitespace is trimmed.',
};

const description = {
  type: 'string',
  maxLength: 255,
  default: '',
  description: 'Optional free text, trimmed, at most 255 characters. Defaults to an empty string.',
};

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Account & Transaction Ledger API',
    version: '1.0.0',
    description: [
      'REST API for managing accounts, recording credits/debits and transferring money.',
      '',
      '**Balance consistency** - an account balance is changed only in the same database transaction that inserts the',
      'corresponding ledger entry, after taking a row lock on the account. The stored balance therefore always equals',
      'the sum of credits minus the sum of debits. PostgreSQL CHECK constraints additionally forbid negative balances',
      'and non-positive amounts.',
      '',
      '**Immutability** - transactions are append-only. There are no update or delete endpoints, unsupported methods',
      'return 405, and a database trigger rejects UPDATE/DELETE on ledger rows. Mistakes are corrected with a',
      'compensating transaction (e.g. a credit that reverses an erroneous debit).',
      '',
      '**Idempotency** - `reference_id` is unique per account for transactions and globally unique for transfers.',
      'Re-submitting a reference returns 409 and never changes a balance, so clients can safely retry.',
      '',
      'All monetary values are exact decimals serialized as strings (e.g. `"100.00"`).',
    ].join('\n'),
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Accounts' },
    { name: 'Transactions', description: 'Append-only ledger entries. Create and read only.' },
    { name: 'Transfers', description: 'Atomic movement of money between two accounts.' },
    { name: 'Health' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness and database connectivity check',
        responses: {
          '200': success('API and database are reachable.', {
            type: 'object',
            properties: { status: { type: 'string', example: 'ok' } },
          }),
          '500': commonErrors['500'],
        },
      },
    },
    '/api/accounts': {
      get: {
        tags: ['Accounts'],
        summary: 'List all accounts',
        description: 'Returns every account with its current balance, newest first.',
        responses: {
          '200': success('List of accounts.', { type: 'array', items: ref('Account') }),
          '500': commonErrors['500'],
        },
      },
      post: {
        tags: ['Accounts'],
        summary: 'Create an account',
        description: 'Creates an account with a balance of 0.00. A client-supplied balance is rejected.',
        requestBody: jsonBody('CreateAccountRequest', { name: 'John Doe' }),
        responses: {
          '201': success('Account created.', ref('Account')),
          '400': errorResponse('Missing, empty or whitespace-only name, unknown fields or invalid JSON.', {
            code: 'VALIDATION_ERROR',
            message: 'The request contains invalid data.',
          }),
          '500': commonErrors['500'],
        },
      },
    },
    '/api/accounts/{accountId}': {
      get: {
        tags: ['Accounts'],
        summary: 'Get account details and current balance',
        parameters: [accountIdParam],
        responses: {
          '200': success('The account.', ref('Account')),
          '400': errorResponse('Malformed account ID.', {
            code: 'INVALID_ACCOUNT_ID',
            message: 'The account ID is invalid.',
          }),
          '404': errorResponse('Account does not exist.', { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found.' }),
          '500': commonErrors['500'],
        },
      },
    },
    '/api/accounts/{accountId}/transactions': {
      post: {
        tags: ['Transactions'],
        summary: 'Credit or debit an account',
        description: [
          'Inserts a ledger entry and applies it to the balance atomically.',
          '',
          '- The account row is locked (`SELECT ... FOR UPDATE`) for the duration of the database transaction,',
          '  so concurrent debits cannot spend the same funds.',
          '- `reference_id` must be unique for the account (database UNIQUE constraint). Duplicates return 409',
          '  `DUPLICATE_TRANSACTION` and do not change the balance. The same reference may be used on different accounts.',
          '- References starting with `transfer:` are reserved for ledger entries created by transfers.',
          '- Debits larger than the balance return 409 `INSUFFICIENT_BALANCE` and nothing is written.',
          '- The new balance is always computed by the server; it is never accepted from the client.',
        ].join('\n'),
        parameters: [accountIdParam],
        requestBody: jsonBody('CreateTransactionRequest', {
          type: 'credit',
          amount: '100.00',
          description: 'Initial deposit',
          reference_id: 'REF-001',
        }),
        responses: {
          '201': success('Transaction recorded; includes the account with its updated balance.', {
            type: 'object',
            properties: { transaction: ref('Transaction'), account: ref('Account') },
          }),
          '400': errorResponse('Invalid account ID, type, amount, reference_id, description or JSON.', {
            code: 'VALIDATION_ERROR',
            message: 'The request contains invalid data.',
          }),
          '404': errorResponse('Account does not exist.', { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found.' }),
          '409': errorResponse('Duplicate reference_id or insufficient balance.', {
            code: 'INSUFFICIENT_BALANCE',
            message: 'The account does not have sufficient balance.',
          }),
          '500': commonErrors['500'],
        },
      },
      get: {
        tags: ['Transactions'],
        summary: 'Paginated transaction history',
        description:
          'Returns transactions for the account only, ordered by `created_at` descending with `id` descending as a tie-breaker. Pagination is done in the database.',
        parameters: [
          accountIdParam,
          {
            name: 'page',
            in: 'query',
            required: false,
            description: '1-based page number. A page beyond the last returns an empty `data` array.',
            schema: { type: 'integer', minimum: 1, default: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            description: `Page size. Values above ${PAGE_SIZE_MAX} are rejected.`,
            schema: { type: 'integer', minimum: 1, maximum: PAGE_SIZE_MAX, default: PAGE_SIZE_DEFAULT },
          },
        ],
        responses: {
          '200': {
            description: 'A page of transactions.',
            content: { 'application/json': { schema: ref('TransactionPage') } },
          },
          '400': errorResponse('Malformed account ID or invalid page/limit.', {
            code: 'INVALID_PAGINATION',
            message: 'The pagination parameters are invalid.',
          }),
          '404': errorResponse('Account does not exist.', { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found.' }),
          '500': commonErrors['500'],
        },
      },
    },
    '/api/transfers': {
      post: {
        tags: ['Transfers'],
        summary: 'Transfer money between two accounts',
        description: [
          'Debits the source and credits the destination in a single database transaction. A `Transfer` record is',
          'created together with one DEBIT and one CREDIT ledger entry (reference `transfer:<reference_id>`).',
          '',
          '- Both account rows are locked in ascending id order to avoid deadlocks between opposing transfers.',
          '- `reference_id` is globally unique across transfers. A retry with the same reference returns 409',
          '  `DUPLICATE_TRANSFER` and moves no money, even if the first request is still in flight.',
          '- If any step fails, every change is rolled back; a partial transfer is never persisted.',
        ].join('\n'),
        requestBody: jsonBody('CreateTransferRequest', {
          from_account_id: '6c1f6f47-31a8-4f0a-8b3c-3bd1b0c5a001',
          to_account_id: '0e8a7f6b-2f39-4c1e-9d55-6b2d8a3cb002',
          amount: '30.00',
          reference_id: 'TRANSFER-001',
          description: 'Transfer to another account',
        }),
        responses: {
          '201': success('Transfer completed.', ref('TransferResult')),
          '400': errorResponse('Invalid input or source equals destination (SAME_ACCOUNT_TRANSFER).', {
            code: 'SAME_ACCOUNT_TRANSFER',
            message: 'Source and destination accounts must be different.',
          }),
          '404': errorResponse('SOURCE_ACCOUNT_NOT_FOUND or DESTINATION_ACCOUNT_NOT_FOUND.', {
            code: 'SOURCE_ACCOUNT_NOT_FOUND',
            message: 'Source account not found.',
          }),
          '409': errorResponse('DUPLICATE_TRANSFER or INSUFFICIENT_BALANCE.', {
            code: 'DUPLICATE_TRANSFER',
            message: 'A transfer with reference_id "TRANSFER-001" has already been processed.',
          }),
          '500': commonErrors['500'],
        },
      },
    },
  },
  components: {
    schemas: {
      Account: {
        type: 'object',
        required: ['id', 'name', 'balance', 'created_at', 'updated_at'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'John Doe' },
          balance: { ...money, description: 'Current balance, never negative.' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      CreateAccountRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100, description: 'Trimmed; must not be blank.' },
        },
      },
      Transaction: {
        type: 'object',
        description: 'Immutable ledger entry.',
        required: ['id', 'account_id', 'type', 'amount', 'description', 'reference_id', 'transfer_id', 'created_at'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          account_id: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['credit', 'debit'] },
          amount: money,
          description: { type: 'string' },
          reference_id: { type: 'string' },
          transfer_id: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Set when the entry was created by a transfer.',
          },
          created_at: { type: 'string', format: 'date-time', description: 'Assigned by the database.' },
        },
      },
      CreateTransactionRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'amount', 'reference_id'],
        properties: {
          type: { type: 'string', enum: ['credit', 'debit'] },
          amount: moneyInput,
          description,
          reference_id: referenceId,
        },
      },
      Pagination: {
        type: 'object',
        required: ['current_page', 'page_size', 'total_records', 'total_pages'],
        properties: {
          current_page: { type: 'integer', example: 1 },
          page_size: { type: 'integer', example: 10 },
          total_records: { type: 'integer', example: 45 },
          total_pages: { type: 'integer', example: 5, description: '0 when there are no records.' },
        },
      },
      TransactionPage: {
        type: 'object',
        required: ['success', 'data', 'pagination'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: { type: 'array', items: ref('Transaction') },
          pagination: ref('Pagination'),
        },
      },
      Transfer: {
        type: 'object',
        required: ['id', 'from_account_id', 'to_account_id', 'amount', 'description', 'reference_id', 'created_at'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          from_account_id: { type: 'string', format: 'uuid' },
          to_account_id: { type: 'string', format: 'uuid' },
          amount: money,
          description: { type: 'string' },
          reference_id: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      CreateTransferRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['from_account_id', 'to_account_id', 'amount', 'reference_id'],
        properties: {
          from_account_id: { type: 'string', format: 'uuid' },
          to_account_id: { type: 'string', format: 'uuid' },
          amount: moneyInput,
          reference_id: referenceId,
          description,
        },
      },
      TransferResult: {
        type: 'object',
        properties: {
          transfer: ref('Transfer'),
          debit_transaction: ref('Transaction'),
          credit_transaction: ref('Transaction'),
          from_account: ref('Account'),
          to_account: ref('Account'),
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                enum: [
                  'VALIDATION_ERROR',
                  'INVALID_ACCOUNT_ID',
                  'INVALID_PAGINATION',
                  'INVALID_JSON',
                  'PAYLOAD_TOO_LARGE',
                  'UNSUPPORTED_MEDIA_TYPE',
                  'ACCOUNT_NOT_FOUND',
                  'SOURCE_ACCOUNT_NOT_FOUND',
                  'DESTINATION_ACCOUNT_NOT_FOUND',
                  'SAME_ACCOUNT_TRANSFER',
                  'ROUTE_NOT_FOUND',
                  'METHOD_NOT_ALLOWED',
                  'DUPLICATE_TRANSACTION',
                  'DUPLICATE_TRANSFER',
                  'INSUFFICIENT_BALANCE',
                  'CONFLICT',
                  'SERVICE_UNAVAILABLE',
                  'INTERNAL_SERVER_ERROR',
                ],
              },
              message: { type: 'string' },
              details: {
                type: 'array',
                description: 'Present for validation errors: one entry per invalid field.',
                items: {
                  type: 'object',
                  properties: { field: { type: 'string' }, message: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  },
};
