import type { Account } from '@prisma/client';
import { formatMoney } from '../../lib/money.js';

export interface AccountDto {
  id: string;
  name: string;
  balance: string;
  created_at: string;
  updated_at: string;
}

export const toAccountDto = (account: Account): AccountDto => ({
  id: account.id,
  name: account.name,
  balance: formatMoney(account.balance),
  created_at: account.createdAt.toISOString(),
  updated_at: account.updatedAt.toISOString(),
});
