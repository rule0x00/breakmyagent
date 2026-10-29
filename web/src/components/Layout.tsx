import { Link, NavLink, Outlet } from 'react-router';
import { tokenStore } from '../api/client';
import { useMe } from '../api/hooks';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`;

export function Layout() {
  const me = useMe();

  function switchPlayer() {
    const ok = window.confirm(
      'Guest accounts have no password: if you switch, you cannot get back to this player. Continue?',
    );
    if (ok) tokenStore.set(null);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/" className="font-mono text-lg font-bold tracking-tight">
            Break<span className="text-emerald-400">My</span>Agent
          </Link>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              Levels
            </NavLink>
            <NavLink to="/leaderboard" className={navClass}>
              Leaderboard
            </NavLink>
            <NavLink to="/stats" className={navClass}>
              Stats
            </NavLink>
          </nav>
          {me.data && (
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="text-slate-400">
                <span className="hidden sm:inline">Playing as </span>
                <span className="font-mono text-slate-100">{me.data.nickname}</span>
              </span>
              <button onClick={switchPlayer} className="text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline">
                switch
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
