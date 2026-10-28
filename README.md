# Account & Transaction Ledger

A full-stack account and transaction management system. It is built around **financial data integrity**: atomic
balance updates, row-level locking against race conditions, database-enforced idempotency, an append-only ledger and
exact decimal arithmetic.

- **Backend:** Node.js, Express 5, TypeScript, Zod, Prisma 6, PostgreSQL
- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 4, React Router 7, Axios
- **Testing:** Vitest + Supertest against a real PostgreSQL database
- **Docs:** Swagger UI at `/api-docs`, [docs/api.md](docs/api.md), [Postman collection](postman/collection.json),
  [ASSUMPTIONS.md](ASSUMPTIONS.md)

## Features

- Create accounts (balance always starts at 0.00), list accounts, view account details and current balance.
- Credit and debit accounts. Debits never overdraw, even under concurrent requests.
- Duplicate protection: a `reference_id` can be used only once per account (database `UNIQUE` constraint).
- Paginated transaction history, newest first, with deterministic ordering and accurate metadata.
- Immutable ledger: no update/delete endpoints, and a database trigger blocks `UPDATE`/`DELETE` on ledger rows.
- Centralized error handling with a consistent error envelope and documented error codes.
- **Bonus:** atomic, idempotent money transfers between accounts, with deadlock-safe lock ordering.
- Responsive dashboard: account overview, create account, account details with a credit/debit form and history,
  and a transfer screen. It includes loading, empty and error states and toast notifications.

## Project structure

```
.
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Data model (Account, Transaction, Transfer)
│   │   └── migrations/            # SQL migrations incl. CHECK constraints and immutability triggers
│   ├── src/
│   │   ├── config/env.ts          # Validated environment variables
│   │   ├── docs/openapi.ts        # OpenAPI 3 document served by Swagger UI
│   │   ├── lib/                   # Prisma client, errors, money, validation, row locking
│   │   ├── middleware/            # Central error handler, 404/405 handlers
│   │   ├── modules/
│   │   │   ├── accounts/          # routes → controller → service (+ schemas, serializer)
│   │   │   ├── transactions/
│   │   │   └── transfers/
│   │   ├── app.ts                 # Express app factory
│   │   └── server.ts              # HTTP server entry point
│   └── tests/                     # Integration tests (real PostgreSQL)
├── frontend/
│   └── src/
│       ├── components/            # UI primitives, forms, history table, toasts, layout
│       ├── hooks/                 # Data-fetching hooks, toast hook
│       ├── lib/                   # Money (BigInt cents) and formatting helpers
│       ├── pages/                 # Dashboard, Create account, Account details, Transfer
│       ├── services/              # Axios client and typed API calls
│       └── types/                 # API types
├── docs/api.md                    # API reference
├── postman/collection.json        # Postman collection
├── docker/postgres/init/          # Creates the test database in Docker
├── docker-compose.yml             # Local PostgreSQL
├── ASSUMPTIONS.md
└── README.md
```

## Prerequisites

- Node.js **20.19+** (or 22.12+) and npm
- PostgreSQL 14+, either via Docker (recommended) or a local installation

## Setup

### 1. Start PostgreSQL

With Docker:

```bash
docker compose up -d
```

This starts PostgreSQL 16 on `localhost:5432` (user `postgres`, password `postgres`). It creates the
`account_transactions` database and, on first start, the `account_transactions_test` database.

Without Docker, use any PostgreSQL instance and set the connection strings below. Prisma creates missing databases
automatically when it applies migrations.

### 2. Backend

```bash
cd backend
cp .env.example .env          # adjust DATABASE_URL / TEST_DATABASE_URL if needed
npm install
npx prisma migrate deploy     # apply migrations (creates the database if it does not exist)
npx prisma generate           # generate the Prisma client
npm run dev                   # http://localhost:4000  ·  Swagger UI: http://localhost:4000/api-docs
```

During development, use `npm run prisma:migrate` (`prisma migrate dev`) to create new migrations.

Production build:

```bash
npm run build && npm start
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env          # optional; the defaults work with the backend on :4000
npm install
npm run dev                   # http://localhost:5173
```

In development, the Vite dev server proxies `/api` to `http://localhost:4000`, so no CORS configuration is needed.
For a deployed build, set `VITE_API_BASE_URL` (e.g. `https://api.example.com/api`) before `npm run build`, and add
the frontend origin to the backend's `CORS_ORIGINS`.

### Environment variables

**backend/.env**

| Variable            | Required  | Default                 | Description                                                        |
| ------------------- | --------- | ----------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`      | yes       | –                       | PostgreSQL connection string for the app and migrations            |
| `TEST_DATABASE_URL` | for tests | –                       | Separate database for integration tests (name must contain `test`) |
| `PORT`              | no        | `4000`                  | HTTP port                                                          |
| `NODE_ENV`          | no        | `development`           | `development`, `test` or `production`                              |
| `CORS_ORIGINS`      | no        | `http://localhost:5173` | Comma-separated allowed origins                                    |

**frontend/.env**

| Variable                | Required | Default                 | Description                                   |
| ----------------------- | -------- | ----------------------- | --------------------------------------------- |
| `VITE_API_BASE_URL`     | no       | `/api`                  | API base URL used by the browser              |
| `VITE_API_PROXY_TARGET` | no       | `http://localhost:4000` | Backend that the dev server proxies `/api` to |

The `.env.example` files contain placeholders only. Real `.env` files are git-ignored.

## Tests, linting and type checks

Backend (requires PostgreSQL. The suite applies migrations to `TEST_DATABASE_URL` and truncates its tables between
tests, and it refuses to run against a database whose name does not contain `test`):

```bash
cd backend
npm test               # 132 integration tests
npm run lint
npm run typecheck
npm run format:check   # or: npm run format
```

Frontend:

```bash
cd frontend
npm test               # money helper unit tests
npm run lint
npm run typecheck
npm run build
```

### What the backend tests cover

| File                   | Scenarios                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts.test.ts`     | create, blank/missing/oversized names, control characters / invalid Unicode, client-supplied balance rejected, malformed JSON, 413, list, get, 404, invalid UUID, DB `CHECK`s                                                   |
| `transactions.test.ts` | credit, debit, full-balance debit, insufficient balance, 30 invalid-input cases (incl. NUL bytes / invalid Unicode), duplicates (same/different account), retry semantics, exact decimals, 100+50−30−20=100                     |
| `pagination.test.ts`   | defaults, subsequent/partial/empty pages, totals, newest-first, deterministic tie-break on equal timestamps, invalid `page`/`limit`, max 100, metadata consistent with rows during concurrent writes                            |
| `atomicity.test.ts`    | failures injected with temporary PostgreSQL triggers: commit-time ledger failure, insert failure, balance-update failure → nothing persists                                                                                     |
| `concurrency.test.ts`  | two concurrent 80.00 debits on 100.00 (10 rounds) → exactly one succeeds, balance 20.00; 15 competing debits; 10 concurrent duplicate references; mixed load                                                                    |
| `immutability.test.ts` | `PUT`/`PATCH`/`DELETE` → 405/404, OpenAPI exposes only create/read, database trigger blocks `UPDATE`/`DELETE`                                                                                                                   |
| `errors.test.ts`       | error mapping: unique violation / write conflict → 409, transaction timeout → 503 (retryable), unexpected errors leak no internals                                                                                              |
| `transfers.test.ts`    | success, insufficient funds, missing source/destination, same account, validation, duplicate and concurrent-duplicate transfers, failure after debit / before credit, concurrent overspend, opposing transfers without deadlock |

Every balance assertion compares the stored balance with an **independent recomputation from the ledger**
(`SUM(credits) − SUM(debits)` in SQL).

## How correctness is guaranteed

### Atomicity

Every credit, debit and transfer runs inside one Prisma interactive transaction
([transaction.service.ts](backend/src/modules/transactions/transaction.service.ts),
[transfer.service.ts](backend/src/modules/transfers/transfer.service.ts)):

1. `SELECT id, balance FROM accounts WHERE id = $1 FOR UPDATE`: lock the account row.
2. `INSERT` the ledger entry. The unique constraint rejects duplicate references here.
3. For debits, compare the locked balance with the amount.
4. `UPDATE accounts SET balance = balance ± amount`.

Any thrown error, whether a business rule, a constraint violation or a database failure, rolls back steps 2–4
together.

### Concurrency

Because the row is locked before the balance is read, concurrent requests for the same account are serialized by
PostgreSQL. The second of two simultaneous 80.00 debits waits for the first to commit, then sees 20.00 and is
rejected. The lock is acquired with a parameterized raw query (`$queryRaw` tagged template). Transfers lock both rows
in ascending id order, so A→B and B→A cannot deadlock. As a final safety net, `CHECK (balance >= 0)` makes an
overdraft impossible at the storage layer.

### Duplicate requests

Idempotency relies on `UNIQUE (account_id, reference_id)` (transactions) and `UNIQUE (reference_id)` (transfers),
not on a racy existence check. A violation is translated to `409 DUPLICATE_TRANSACTION` / `DUPLICATE_TRANSFER`, and
because it happens inside the transaction, no balance change survives.

### Balance consistency

`accounts.balance` is a cached aggregate of the ledger. It is only ever modified in the same transaction that
inserts the ledger entry, so `balance = Σ credits − Σ debits` holds at every commit. The tests verify this after
every scenario.

### Immutability

There are no update/delete routes (unsupported methods → 405). The `transactions_immutable` / `transfers_immutable`
triggers reject `UPDATE` and `DELETE` even from direct database access. Corrections are made with compensating
transactions.

## Example requests

```bash
# Create an account
curl -s -X POST http://localhost:4000/api/accounts \
  -H 'Content-Type: application/json' -d '{"name":"John Doe"}'

ACCOUNT_ID=<id from the response>

# Credit
curl -s -X POST http://localhost:4000/api/accounts/$ACCOUNT_ID/transactions \
  -H 'Content-Type: application/json' \
  -d '{"type":"credit","amount":"100.00","description":"Initial deposit","reference_id":"REF-001"}'

# Debit
curl -s -X POST http://localhost:4000/api/accounts/$ACCOUNT_ID/transactions \
  -H 'Content-Type: application/json' \
  -d '{"type":"debit","amount":"30.00","description":"Payment","reference_id":"REF-002"}'

# History
curl -s "http://localhost:4000/api/accounts/$ACCOUNT_ID/transactions?page=1&limit=10"

# Transfer
curl -s -X POST http://localhost:4000/api/transfers \
  -H 'Content-Type: application/json' \
  -d '{"from_account_id":"'$ACCOUNT_ID'","to_account_id":"<other id>","amount":"30.00","reference_id":"TRANSFER-001"}'
```

The full reference, including every error code, is in [docs/api.md](docs/api.md) and Swagger UI
(`/api-docs`). The Postman collection captures account ids automatically: run the two "Create account" requests
first.

## Known limitations

- No authentication or authorization (out of scope for the assessment).
- Single currency. Amounts are limited to 1,000,000,000.00 per operation, and balances use `NUMERIC(19,2)`.
- `GET /api/accounts` is not paginated.
- Offset pagination can shift by a row if new transactions arrive between page requests. Keyset pagination on
  `(created_at, id)` would fix this.
- A duplicate reference returns 409 instead of replaying the original response.
- Writes to a single account are serialized by design, which limits throughput for one extremely hot account. That is
  the expected trade-off for strict consistency.
