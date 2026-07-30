import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { levelFromXp } from '../lib/xp';
import { nextStepForArea } from '../lib/tree';
import { currentStreak } from '../lib/streak';
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID } from '../lib/achievements';
import { XPBar } from '../components/XPBar';
import { AreaFormModal } from '../components/AreaFormModal';
import { ActivityFormModal } from '../components/ActivityFormModal';

export function Dashboard() {
  const profile = useAppStore((s) => s.profile);
  const areas = useAppStore((s) => s.areas);
  const nodes = useAppStore((s) => s.nodes);
  const logs = useAppStore((s) => s.logs);
  const unlocks = useAppStore((s) => s.achievements);

  const [showAreaForm, setShowAreaForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);

  const characterLevel = areas.reduce((sum, a) => sum + levelFromXp(a.xp), 0);
  const totalXp = areas.reduce((sum, a) => sum + a.xp, 0);
  const streak = currentStreak(logs);
  const completedNodes = nodes.filter((n) => n.status === 'completed').length;
  const recentUnlocks = [...unlocks]
    .sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Character summary */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {profile?.name}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Charakter-Level{' '}
              <span className="font-bold text-amber-300">{characterLevel}</span>{' '}
              · {totalXp.toLocaleString('de-DE')} XP gesamt ·{' '}
              {completedNodes} Skills abgeschlossen
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`rounded-xl border px-4 py-2 text-center ${
                streak > 0
                  ? 'border-orange-400/40 bg-orange-400/10'
                  : 'border-slate-800 bg-slate-900'
              }`}
            >
              <div className="text-xl font-bold">
                {streak > 0 ? '🔥' : '❄️'} {streak}
              </div>
              <div className="text-xs text-slate-400">
                {streak === 1 ? 'Tag Streak' : 'Tage Streak'}
              </div>
            </div>
            <button
              onClick={() => setShowActivityForm(true)}
              className="rounded-xl bg-sky-500 px-5 py-3 font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:bg-sky-400"
            >
              + Aktivität
            </button>
          </div>
        </div>
      </section>

      {/* Area tiles */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Deine Bereiche</h2>
          <button
            onClick={() => setShowAreaForm(true)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            + Neuer Bereich
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => {
            const level = levelFromXp(area.xp);
            const nextStep = nextStepForArea(nodes, area.id);
            return (
              <Link
                key={area.id}
                to={`/area/${area.id}`}
                className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:-translate-y-0.5 hover:border-slate-600"
                style={{ boxShadow: `inset 0 1px 0 ${area.color}22` }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl"
                      style={{ backgroundColor: `${area.color}1a` }}
                    >
                      {area.icon}
                    </span>
                    <div>
                      <h3 className="font-bold group-hover:text-white">
                        {area.name}
                      </h3>
                      <span
                        className="text-sm font-semibold"
                        style={{ color: area.color }}
                      >
                        Level {level}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <XPBar xp={area.xp} color={area.color} />
                </div>
                <div className="mt-3 rounded-lg bg-slate-950/60 px-3 py-2 text-xs">
                  {nextStep ? (
                    <>
                      <span className="text-slate-500">Nächster Schritt: </span>
                      <span className="text-slate-300">{nextStep.title}</span>
                    </>
                  ) : (
                    <span className="text-slate-500">
                      Alle Skills abgeschlossen – füge neue hinzu! 🎉
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Badges */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Abzeichen</h2>
          <Link
            to="/achievements"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            alle ansehen ({unlocks.length}/{ACHIEVEMENTS.length}) →
          </Link>
        </div>
        {recentUnlocks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-sm text-slate-500">
            Noch keine Abzeichen – protokolliere deine erste Aktivität!
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {recentUnlocks.map((unlock) => {
              const badge = ACHIEVEMENTS_BY_ID.get(unlock.id);
              if (!badge) return null;
              return (
                <Link
                  key={unlock.id}
                  to="/achievements"
                  title={badge.description}
                  className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-sm transition hover:border-amber-400/60"
                >
                  <span className="text-xl">{badge.icon}</span>
                  <span className="font-medium text-slate-200">
                    {badge.title}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent activity */}
      {logs.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Letzte Aktivitäten</h2>
          <ul className="space-y-2">
            {logs.slice(0, 6).map((log) => {
              const area = areas.find((a) => a.id === log.areaId);
              return (
                <li
                  key={log.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-2.5 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span>{area?.icon ?? '❔'}</span>
                    <span className="truncate text-slate-300">
                      {log.description}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className="font-semibold"
                      style={{ color: area?.color ?? '#94a3b8' }}
                    >
                      +{log.xp} XP
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(log.timestamp).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {showAreaForm && (
        <AreaFormModal area={null} onClose={() => setShowAreaForm(false)} />
      )}
      {showActivityForm && (
        <ActivityFormModal onClose={() => setShowActivityForm(false)} />
      )}
    </div>
  );
}
