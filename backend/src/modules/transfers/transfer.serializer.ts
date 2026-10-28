import type { Transfer } from '@prisma/client';
import { formatMoney } from '../../lib/money.js';
import { toAccountDto } from '../accounts/account.serializer.js';
import { toTransactionDto } from '../transactions/transaction.serializer.js';
import type { TransferResult } from './transfer.service.js';

export const toTransferDto = (transfer: Transfer) => ({
  id: transfer.id,
  from_account_id: transfer.fromAccountId,
  to_account_id: transfer.toAccountId,
  amount: formatMoney(transfer.amount),
  description: transfer.description,
  reference_id: transfer.referenceId,
  created_at: transfer.createdAt.toISOString(),
});

export const toTransferResultDto = (result: TransferResult) => ({
  transfer: toTransferDto(result.transfer),
  debit_transaction: toTransactionDto(result.debitTransaction),
  credit_transaction: toTransactionDto(result.creditTransaction),
  from_account: toAccountDto(result.fromAccount),
  to_account: toAccountDto(result.toAccount),
});
