import { Link } from 'react-router';
import { Card, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { useAccounts } from '../hooks/useAccounts';
import { formatDate } from '../lib/format';
import { formatMoney, sumAmounts } from '../lib/money';

const linkButton =
  'inline-flex items-center justify-center rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2';

function Stat({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      {value === null ? (
        <Skeleton className="mt-2 h-8 w-32" />
      ) : (
        <p className="tabular mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function DashboardPage() {
  const { data: accounts, error, loading, reload } = useAccounts();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Accounts and balances, as recorded by the server.</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/transfers"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Transfer money
          </Link>
          <Link to="/accounts/new" className={linkButton}>
            + Create account
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Total accounts" value={accounts ? String(accounts.length) : null} />
        <Stat
          label="Combined balance"
          value={accounts ? formatMoney(sumAmounts(accounts.map((a) => a.balance))) : null}
          hint="Sum of all account balances"
        />
      </div>

      <Card
        title="Accounts"
        actions={
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="rounded text-sm font-medium text-teal-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      >
        {error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : !accounts ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading accounts">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <EmptyState
            title="No accounts yet"
            description="Create your first account to start recording credits and debits."
            action={
              <Link to="/accounts/new" className={linkButton}>
                Create account
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">All accounts</caption>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Name
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Balance
                  </th>
                  <th scope="col" className="hidden py-2 pr-4 font-medium sm:table-cell">
                    Created
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-slate-900">{account.name}</p>
                      <p className="hidden font-mono text-xs text-slate-400 sm:block">{account.id}</p>
                    </td>
                    <td className="tabular whitespace-nowrap py-3 pr-4 text-right font-semibold text-slate-900">
                      {formatMoney(account.balance)}
                    </td>
                    <td className="hidden whitespace-nowrap py-3 pr-4 text-slate-600 sm:table-cell">
                      <time dateTime={account.created_at}>{formatDate(account.created_at)}</time>
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        to={`/accounts/${account.id}`}
                        className="whitespace-nowrap rounded text-sm font-medium text-teal-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                        aria-label={`View details for ${account.name}`}
                      >
                        View details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
