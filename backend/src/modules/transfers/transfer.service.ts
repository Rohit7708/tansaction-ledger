import type { Account, Transaction, Transfer } from '@prisma/client';
import { AppError, accountNotFound, insufficientBalance } from '../../lib/errors.js';
import { isUniqueViolation, lockAccount, type LockedAccount } from '../../lib/ledger.js';
import { toDecimal } from '../../lib/money.js';
import { prisma } from '../../lib/prisma.js';
import { TRANSFER_REFERENCE_PREFIX } from '../transactions/transaction.schemas.js';
import type { CreateTransferInput } from './transfer.schemas.js';

export interface TransferResult {
  transfer: Transfer;
  debitTransaction: Transaction;
  creditTransaction: Transaction;
  fromAccount: Account;
  toAccount: Account;
}

export const transferService = {
  /**
   * Moves money between two accounts in ONE database transaction:
   *
   *   1. Lock both account rows in ascending id order. Every transfer locks in the
   *      same global order, so two opposing transfers (A->B and B->A) cannot deadlock.
   *   2. Insert the Transfer row. Its globally UNIQUE reference_id makes the transfer
   *      idempotent: a retry with the same reference is rejected and moves no money.
   *   3. Check the source balance read under the lock.
   *   4. Debit the source and write its DEBIT ledger entry, then credit the destination
   *      and write its CREDIT ledger entry. Both entries link back to the transfer.
   *
   * A failure at any step rolls back every write, so a partial transfer cannot persist.
   */
  async create(input: CreateTransferInput): Promise<TransferResult> {
    if (input.from_account_id === input.to_account_id) {
      throw new AppError(400, 'SAME_ACCOUNT_TRANSFER', 'Source and destination accounts must be different.');
    }

    const amount = toDecimal(input.amount);
    const ledgerReference = `${TRANSFER_REFERENCE_PREFIX}${input.reference_id}`;

    try {
      return await prisma.$transaction(async (tx) => {
        const locked = new Map<string, LockedAccount>();
        for (const id of [input.from_account_id, input.to_account_id].sort()) {
          const account = await lockAccount(tx, id);
          if (account) {
            locked.set(id, account);
          }
        }
        const source = locked.get(input.from_account_id);
        const destination = locked.get(input.to_account_id);

        if (!source) {
          throw accountNotFound('SOURCE_ACCOUNT_NOT_FOUND', 'Source account not found.');
        }
        if (!destination) {
          throw accountNotFound('DESTINATION_ACCOUNT_NOT_FOUND', 'Destination account not found.');
        }

        const transfer = await tx.transfer.create({
          data: {
            fromAccountId: input.from_account_id,
            toAccountId: input.to_account_id,
            amount,
            description: input.description,
            referenceId: input.reference_id,
          },
        });

        if (source.balance.lt(amount)) {
          throw insufficientBalance();
        }

        const fromAccount = await tx.account.update({
          where: { id: input.from_account_id },
          data: { balance: { decrement: amount } },
        });
        const debitTransaction = await tx.transaction.create({
          data: {
            accountId: input.from_account_id,
            type: 'DEBIT',
            amount,
            description: input.description,
            referenceId: ledgerReference,
            transferId: transfer.id,
          },
        });

        const toAccount = await tx.account.update({
          where: { id: input.to_account_id },
          data: { balance: { increment: amount } },
        });
        const creditTransaction = await tx.transaction.create({
          data: {
            accountId: input.to_account_id,
            type: 'CREDIT',
            amount,
            description: input.description,
            referenceId: ledgerReference,
            transferId: transfer.id,
          },
        });

        return { transfer, debitTransaction, creditTransaction, fromAccount, toAccount };
      });
    } catch (err) {
      if (isUniqueViolation(err, 'reference_id')) {
        throw new AppError(
          409,
          'DUPLICATE_TRANSFER',
          `A transfer with reference_id "${input.reference_id}" has already been processed.`,
        );
      }
      throw err;
    }
  },
};
