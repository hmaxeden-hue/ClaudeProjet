import { Link, Outlet } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { levelFromXp } from '../lib/xp';
import { FeedbackOverlays } from './FeedbackOverlays';

export function Layout() {
  const profile = useAppStore((s) => s.profile);
  const areas = useAppStore((s) => s.areas);

  const totalXp = areas.reduce((sum, a) => sum + a.xp, 0);
  const characterLevel = areas.reduce((sum, a) => sum + levelFromXp(a.xp), 0);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">⚔️</span>
            <span className="text-lg font-bold tracking-tight">Life RPG</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-400 sm:inline">
              {profile?.name}
            </span>
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 font-semibold text-amber-300">
              Level {characterLevel}
            </span>
            <span className="hidden rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300 sm:inline">
              {totalXp.toLocaleString('de-DE')} XP
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <FeedbackOverlays />
    </div>
  );
}
