import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { levelFromXp } from '../lib/xp';
import { FeedbackOverlays } from './FeedbackOverlays';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/library', label: 'Bibliothek', icon: '📚' },
  { to: '/achievements', label: 'Abzeichen', icon: '🏅' },
];

export function Layout() {
  const profile = useAppStore((s) => s.profile);
  const areas = useAppStore((s) => s.areas);

  const totalXp = areas.reduce((sum, a) => sum + a.xp, 0);
  const characterLevel = areas.reduce((sum, a) => sum + levelFromXp(a.xp), 0);

  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-2xl">⚔️</span>
              <span className="text-lg font-bold tracking-tight">Life RPG</span>
            </Link>
            {/* Desktop navigation; mobile uses the bottom bar below. */}
            <nav className="hidden gap-1 sm:flex">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`
                  }
                >
                  {item.icon} {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-400 md:inline">
              {profile?.name}
            </span>
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 font-semibold text-amber-300">
              Level {characterLevel}
            </span>
            <span className="hidden rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300 md:inline">
              {totalXp.toLocaleString('de-DE')} XP
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-slate-800 bg-slate-950/95 backdrop-blur sm:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition ${
                isActive ? 'text-sky-400' : 'text-slate-500'
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <FeedbackOverlays />
    </div>
  );
}
