import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { ToastContext, type ToastVariant } from '../hooks/useToast';

interface Toast {
  id: number;
  variant: ToastVariant;
  title: string;
  message?: string;
}

const styles: Record<ToastVariant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
  info: 'border-slate-200 bg-white text-slate-900',
};

const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (variant: ToastVariant, title: string, message?: string) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { id, variant, title, message }]);
      window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 shadow-lg ${styles[toast.variant]}`}
          >
            <div className="flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.message && <p className="mt-1 text-sm opacity-90">{toast.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded text-sm opacity-60 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
