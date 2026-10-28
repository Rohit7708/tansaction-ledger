import type { Pagination as PaginationMeta } from '../types/api';

interface Props {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({ pagination, onPageChange, disabled = false }: Props) {
  const { current_page: page, total_pages: totalPages, total_records: total } = pagination;
  const buttonClass =
    'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <nav aria-label="Transaction pages" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-600">
        Page <span className="font-medium text-slate-900">{totalPages === 0 ? 0 : page}</span> of{' '}
        <span className="font-medium text-slate-900">{totalPages}</span> ·{' '}
        <span className="font-medium text-slate-900">{total}</span> transaction{total === 1 ? '' : 's'}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
