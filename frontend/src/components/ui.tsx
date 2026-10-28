import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

export function Card({
  title,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'credit' | 'debit';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800 focus-visible:ring-teal-500',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400',
  credit: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500',
  debit: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500',
};

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${buttonStyles[variant]} ${className}`}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} aria-hidden="true" />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-medium underline hover:no-underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const inputClass =
  'block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50';

export function TextField({
  label,
  error,
  hint,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`${inputClass} ${error ? 'border-rose-400 focus:ring-rose-300' : 'border-slate-300 focus:ring-teal-300'}`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-rose-700">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function SelectField({
  label,
  error,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClass} ${error ? 'border-rose-400 focus:ring-rose-300' : 'border-slate-300 focus:ring-teal-300'}`}
      >
        {children}
      </select>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function TypeBadge({ type }: { type: 'credit' | 'debit' }) {
  return type === 'credit' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
      <span aria-hidden="true">↓</span> Credit
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
      <span aria-hidden="true">↑</span> Debit
    </span>
  );
}
