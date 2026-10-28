import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { TransactionForm } from '../components/TransactionForm';
import { TransactionHistory } from '../components/TransactionHistory';
import { Card, ErrorState, Skeleton } from '../components/ui';
import { useAccount, useTransactions } from '../hooks/useAccounts';
import { formatDateTime } from '../lib/format';
import { formatMoney } from '../lib/money';

const PAGE_SIZE = 10;

export function AccountDetailsPage() {
  const { accountId = '' } = useParams();
  const account = useAccount(accountId);
  const [page, setPage] = useState(1);
  const history = useTransactions(accountId, page, PAGE_SIZE);
  const { reload: reloadAccount } = account;
  const { reload: reloadHistory } = history;

  // Only called after the server confirmed the transaction: re-read the balance
  // and jump to the first page, where the newest transaction appears.
  const handleTransactionCreated = useCallback(() => {
    reloadAccount();
    setPage(1);
    reloadHistory();
  }, [reloadAccount, reloadHistory]);

  if (account.error && !account.data) {
    const notFound = account.error.status === 404 || account.error.code === 'INVALID_ACCOUNT_ID';
    return (
      <div className="space-y-4">
        <Link to="/" className="text-sm text-teal-700 hover:underline">
          ← Back to dashboard
        </Link>
        <ErrorState
          message={notFound ? 'This account does not exist.' : account.error.message}
          onRetry={notFound ? undefined : account.reload}
        />
      </div>
    );
  }

  const data = account.data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-teal-700 hover:underline">
          ← Back to dashboard
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm" aria-busy={account.loading}>
        {!data ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-80" />
            <Skeleton className="h-10 w-40" />
          </div>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">{data.name}</h1>
              <dl className="mt-2 space-y-1 text-sm text-slate-500">
                <div className="flex flex-wrap gap-x-2">
                  <dt>Account ID:</dt>
                  <dd className="break-all font-mono text-xs leading-5 text-slate-700">{data.id}</dd>
                </div>
                <div className="flex gap-x-2">
                  <dt>Created:</dt>
                  <dd className="text-slate-700">
                    <time dateTime={data.created_at}>{formatDateTime(data.created_at)}</time>
                  </dd>
                </div>
              </dl>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Current balance</p>
              <p className={`tabular text-3xl font-semibold text-slate-900 ${account.loading ? 'opacity-60' : ''}`}>
                {formatMoney(data.balance)}
              </p>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="New transaction" className="lg:col-span-1">
          {data ? (
            <TransactionForm accountId={accountId} balance={data.balance} onSuccess={handleTransactionCreated} />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </Card>
        <Card title="Transaction history" className="lg:col-span-2">
          <TransactionHistory
            result={history.data}
            loading={history.loading}
            error={history.error}
            onRetry={history.reload}
            onPageChange={setPage}
          />
        </Card>
      </div>
    </div>
  );
}
