import { formatDateTime } from '../lib/format';
import { formatMoney } from '../lib/money';
import type { ApiError } from '../services/http';
import type { PaginatedResponse, Transaction } from '../types/api';
import { Pagination } from './Pagination';
import { EmptyState, ErrorState, Skeleton, TypeBadge } from './ui';

interface Props {
  result: PaginatedResponse<Transaction> | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onPageChange: (page: number) => void;
}

/** Read-only view of the ledger: transactions cannot be edited or deleted. */
export function TransactionHistory({ result, loading, error, onRetry, onPageChange }: Props) {
  if (error && !result) {
    return <ErrorState message={error.message} onRetry={onRetry} />;
  }

  if (!result) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading transactions">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (result.pagination.total_records === 0) {
    return (
      <EmptyState
        title="No transactions yet"
        description="Credits and debits for this account will appear here, newest first."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorState message={error.message} onRetry={onRetry} />}
      <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">Transaction history, newest first</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-4 font-medium">
                Type
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Amount
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Description
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Reference ID
              </th>
              <th scope="col" className="py-2 font-medium">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.data.map((tx) => (
              <tr key={tx.id} className="align-top">
                <td className="py-3 pr-4">
                  <TypeBadge type={tx.type} />
                </td>
                <td
                  className={`tabular whitespace-nowrap py-3 pr-4 text-right font-medium ${
                    tx.type === 'credit' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {tx.type === 'credit' ? '+' : '−'}
                  {formatMoney(tx.amount)}
                </td>
                <td className="max-w-xs py-3 pr-4 text-slate-700">
                  <span className="break-words">{tx.description || <span className="text-slate-400">—</span>}</span>
                  {tx.transfer_id && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">transfer</span>
                  )}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-slate-600">{tx.reference_id}</td>
                <td className="whitespace-nowrap py-3 text-slate-600">
                  <time dateTime={tx.created_at}>{formatDateTime(tx.created_at)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.data.length === 0 && (
        <p className="text-sm text-slate-500">This page is empty. Go back to an earlier page.</p>
      )}
      <Pagination pagination={result.pagination} onPageChange={onPageChange} disabled={loading} />
    </div>
  );
}
