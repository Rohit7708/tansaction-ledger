import { type Account, Prisma, type Transaction } from '@prisma/client';
import { AppError, accountNotFound, insufficientBalance } from '../../lib/errors.js';
import { isUniqueViolation, lockAccount } from '../../lib/ledger.js';
import { toDecimal } from '../../lib/money.js';
import { prisma } from '../../lib/prisma.js';
import type { CreateTransactionInput, PaginationQuery } from './transaction.schemas.js';

export interface TransactionResult {
  transaction: Transaction;
  account: Account;
}

export interface TransactionPage {
  items: Transaction[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const transactionService = {
  /**
   * Records a credit or debit and applies it to the balance in ONE database transaction:
   *
   *   1. Lock the account row (SELECT ... FOR UPDATE) so concurrent writers serialize.
   *   2. Insert the ledger entry. The UNIQUE (account_id, reference_id) constraint
   *      rejects duplicates, including concurrent ones, without a racy pre-check.
   *   3. For debits, check the balance that was read under the lock.
   *   4. Apply the delta to the balance (the CHECK balance >= 0 constraint is a final guard).
   *
   * Any error in steps 2-4 rolls back everything, so a rejected request never
   * leaves a ledger entry without its balance change or vice versa.
   */
  async create(accountId: string, input: CreateTransactionInput): Promise<TransactionResult> {
    const amount = toDecimal(input.amount);

    try {
      return await prisma.$transaction(async (tx) => {
        const locked = await lockAccount(tx, accountId);
        if (!locked) {
          throw accountNotFound();
        }

        const transaction = await tx.transaction.create({
          data: {
            accountId,
            type: input.type === 'credit' ? 'CREDIT' : 'DEBIT',
            amount,
            description: input.description,
            referenceId: input.reference_id,
          },
        });

        if (input.type === 'debit' && locked.balance.lt(amount)) {
          throw insufficientBalance();
        }

        const account = await tx.account.update({
          where: { id: accountId },
          data: { balance: input.type === 'credit' ? { increment: amount } : { decrement: amount } },
        });

        return { transaction, account };
      });
    } catch (err) {
      if (isUniqueViolation(err, 'reference_id')) {
        throw new AppError(
          409,
          'DUPLICATE_TRANSACTION',
          `A transaction with reference_id "${input.reference_id}" already exists for this account.`,
        );
      }
      throw err;
    }
  },

  async list(accountId: string, { page, limit }: PaginationQuery): Promise<TransactionPage> {
    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true } });
    if (!account) {
      throw accountNotFound();
    }

    const where = { accountId };
    // REPEATABLE READ gives both queries the same snapshot, so total_records always
    // matches the rows returned even while new transactions are being committed.
    const [total, items] = await prisma.$transaction(
      [
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
          where,
          // id is a tie-breaker so ordering is deterministic when timestamps match.
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  },
};
