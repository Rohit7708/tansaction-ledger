# API Reference

Base URL (local): `http://localhost:4000/api`
Interactive docs: `http://localhost:4000/api-docs` (Swagger UI) · raw spec: `http://localhost:4000/api-docs.json`

All request and response bodies are JSON. Monetary values are **decimal strings with two fraction digits** (`"100.00"`).
Request field names and response fields use `snake_case`.

## Response envelopes

Success:

```json
{ "success": true, "data": { ... } }
```

Paginated success adds `pagination`:

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": { "current_page": 1, "page_size": 10, "total_records": 45, "total_pages": 5 }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data.",
    "details": [{ "field": "amount", "message": "amount must be greater than zero" }]
  }
}
```

`details` appears only on validation errors (one entry per invalid field). Stack traces, SQL and raw database
errors are never returned.

## Endpoints

| Method | Path                                    | Purpose                              | Success |
| ------ | --------------------------------------- | ------------------------------------ | ------- |
| GET    | `/api/health`                           | Liveness + database check            | 200     |
| POST   | `/api/accounts`                         | Create an account (balance 0.00)     | 201     |
| GET    | `/api/accounts`                         | List accounts (newest first)         | 200     |
| GET    | `/api/accounts/:accountId`              | Account details and current balance  | 200     |
| POST   | `/api/accounts/:accountId/transactions` | Credit or debit an account           | 201     |
| GET    | `/api/accounts/:accountId/transactions` | Paginated history, newest first      | 200     |
| POST   | `/api/transfers`                        | Atomic transfer between two accounts | 201     |

There are **no** update or delete endpoints for transactions or transfers. Any other method on a known path returns
`405 METHOD_NOT_ALLOWED`; unknown paths return `404 ROUTE_NOT_FOUND`.

### POST /api/accounts

```json
{ "name": "John Doe" }
```

- `name`: required string, trimmed, 1–100 characters, no control characters or invalid Unicode. Unknown fields (including `balance`) are rejected.
- Response `data`: `{ id, name, balance: "0.00", created_at, updated_at }`.

### GET /api/accounts/:accountId

- `400 INVALID_ACCOUNT_ID` for a malformed UUID, `404 ACCOUNT_NOT_FOUND` if it does not exist.

### POST /api/accounts/:accountId/transactions

```json
{ "type": "credit", "amount": "100.00", "description": "Initial deposit", "reference_id": "REF-001" }
```

| Field          | Rules                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`         | Required. `"credit"` or `"debit"` (lowercase).                                                                                                                          |
| `amount`       | Required. String (recommended) or JSON number. Plain decimal, ≤ 2 decimal places, `> 0`, `≤ 1000000000.00`. Rejects exponents, signs, leading zeros, `NaN`, `Infinity`. |
| `description`  | Optional string, trimmed, ≤ 255 characters, no control characters or invalid Unicode. Defaults to `""`.                                                                 |
| `reference_id` | Required. Trimmed, 1–100 characters from `A-Z a-z 0-9 . _ : / -`. Must not start with `transfer:` (reserved).                                                           |

Unknown fields (e.g. `balance`, `created_at`) are rejected with 400.

Response `data`:

```json
{
  "transaction": {
    "id": "…",
    "account_id": "…",
    "type": "credit",
    "amount": "100.00",
    "description": "Initial deposit",
    "reference_id": "REF-001",
    "transfer_id": null,
    "created_at": "2026-10-28T10:30:00.000Z"
  },
  "account": { "id": "…", "name": "John Doe", "balance": "100.00", "created_at": "…", "updated_at": "…" }
}
```

Errors: `400 VALIDATION_ERROR` / `INVALID_ACCOUNT_ID` / `INVALID_JSON`, `404 ACCOUNT_NOT_FOUND`,
`409 DUPLICATE_TRANSACTION`, `409 INSUFFICIENT_BALANCE`.

### GET /api/accounts/:accountId/transactions?page=1&limit=10

- `page`: positive integer, default 1. A page past the end returns `data: []` with correct metadata.
- `limit`: positive integer, default 10, maximum 100 (larger values are rejected, not clamped).
- Ordered by `created_at DESC, id DESC`. Pagination runs in the database (`OFFSET`/`LIMIT`).
- `total_pages` is `ceil(total_records / page_size)` and is `0` when there are no records.
- The count and the rows are read from the same `REPEATABLE READ` snapshot, so the metadata always matches `data`.
- Errors: `400 INVALID_PAGINATION`, `400 INVALID_ACCOUNT_ID`, `404 ACCOUNT_NOT_FOUND`.

### POST /api/transfers

```json
{
  "from_account_id": "…",
  "to_account_id": "…",
  "amount": "30.00",
  "reference_id": "TRANSFER-001",
  "description": "Transfer to another account"
}
```

Same rules for `amount`, `reference_id` and `description` as above. Response `data`:
`{ transfer, debit_transaction, credit_transaction, from_account, to_account }`.

The two ledger entries carry `reference_id = "transfer:<reference_id>"` and `transfer_id = <transfer.id>`.

Errors: `400 VALIDATION_ERROR`, `400 SAME_ACCOUNT_TRANSFER`, `404 SOURCE_ACCOUNT_NOT_FOUND`,
`404 DESTINATION_ACCOUNT_NOT_FOUND`, `409 DUPLICATE_TRANSFER`, `409 INSUFFICIENT_BALANCE`.

## Error codes and HTTP status mapping

| Status | Code                            | When                                                                                            |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`              | Body fails validation (missing/blank/invalid/unknown fields)                                    |
| 400    | `INVALID_ACCOUNT_ID`            | `:accountId` is not a UUID                                                                      |
| 400    | `INVALID_PAGINATION`            | Bad `page` / `limit`                                                                            |
| 400    | `INVALID_JSON`                  | Body is not parseable JSON                                                                      |
| 400    | `SAME_ACCOUNT_TRANSFER`         | Transfer source equals destination                                                              |
| 404    | `ACCOUNT_NOT_FOUND`             | Account does not exist                                                                          |
| 404    | `SOURCE_ACCOUNT_NOT_FOUND`      | Transfer source does not exist                                                                  |
| 404    | `DESTINATION_ACCOUNT_NOT_FOUND` | Transfer destination does not exist                                                             |
| 404    | `ROUTE_NOT_FOUND`               | Unknown path                                                                                    |
| 405    | `METHOD_NOT_ALLOWED`            | e.g. `PUT`/`PATCH`/`DELETE` on transactions or accounts                                         |
| 409    | `DUPLICATE_TRANSACTION`         | `reference_id` already used on this account                                                     |
| 409    | `DUPLICATE_TRANSFER`            | Transfer `reference_id` already processed                                                       |
| 409    | `INSUFFICIENT_BALANCE`          | Debit/transfer exceeds the balance                                                              |
| 409    | `CONFLICT`                      | Other unique-constraint violation or retryable write conflict                                   |
| 503    | `SERVICE_UNAVAILABLE`           | Database transaction timed out (e.g. heavy lock contention); nothing was written, safe to retry |
| 413    | `PAYLOAD_TOO_LARGE`             | Body exceeds 10 KB                                                                              |
| 415    | `UNSUPPORTED_MEDIA_TYPE`        | Unsupported body encoding                                                                       |
| 500    | `INTERNAL_SERVER_ERROR`         | Anything unexpected (details are logged server-side only)                                       |

## Data integrity guarantees

**Atomicity.** Each credit, debit or transfer runs in one PostgreSQL transaction (Prisma interactive transaction).
The ledger insert and the balance update commit together or not at all.

**Concurrency.** The account row is locked with `SELECT … FOR UPDATE` before the balance is read, so concurrent
writers to an account are serialized and the sufficiency check always sees the current balance. Transfers lock both
accounts in ascending id order, which prevents deadlocks between opposing transfers.

**Duplicate protection.** `UNIQUE (account_id, reference_id)` on `transactions` and `UNIQUE (reference_id)` on
`transfers`. No racy "check then insert": the constraint itself rejects the duplicate, and the whole database
transaction (including any balance change) rolls back.

**Balance consistency.** A balance is changed only in the same transaction that inserts its ledger entry, so
`balance = Σ credits − Σ debits` always holds. `CHECK (balance >= 0)` and `CHECK (amount > 0)` back this up at the
database level.

**Immutability.** No update/delete endpoints exist, and a database trigger rejects `UPDATE`/`DELETE` on
`transactions` and `transfers`. A wrong entry is corrected with a compensating transaction (e.g. a credit that
reverses an erroneous debit, with its own reference such as `REVERSAL-REF-002`).
