import { useCallback } from 'react';
import { accountsApi } from '../services/accounts';
import { transactionsApi } from '../services/transactions';
import { useApiQuery } from './useApiQuery';

export const useAccounts = () => useApiQuery(accountsApi.list);

export function useAccount(accountId: string) {
  const fetcher = useCallback(() => accountsApi.get(accountId), [accountId]);
  return useApiQuery(fetcher);
}

export function useTransactions(accountId: string, page: number, limit: number) {
  const fetcher = useCallback(() => transactionsApi.list(accountId, page, limit), [accountId, page, limit]);
  return useApiQuery(fetcher);
}
