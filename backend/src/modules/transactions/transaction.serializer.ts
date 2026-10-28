import type { Transaction } from '@prisma/client';
import { formatMoney } from '../../lib/money.js';

export interface TransactionDto {
  id: string;
  account_id: string;
  type: 'credit' | 'debit';
  amount: string;
  description: string;
  reference_id: string;
  transfer_id: string | null;
  created_at: string;
}

export const toTransactionDto = (transaction: Transaction): TransactionDto => ({
  id: transaction.id,
  account_id: transaction.accountId,
  type: transaction.type === 'CREDIT' ? 'credit' : 'debit',
  amount: formatMoney(transaction.amount),
  description: transaction.description,
  reference_id: transaction.referenceId,
  transfer_id: transaction.transferId,
  created_at: transaction.createdAt.toISOString(),
});
