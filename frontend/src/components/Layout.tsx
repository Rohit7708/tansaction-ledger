import { NavLink, Outlet } from 'react-router';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
    isActive ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export function Layout() {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <NavLink
            to="/"
            className="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-sm font-bold text-white">
              L
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-900">Ledger</span>
          </NavLink>
          <nav aria-label="Main" className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/accounts/new" className={navClass}>
              New account
            </NavLink>
            <NavLink to="/transfers" className={navClass}>
              Transfer
            </NavLink>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
