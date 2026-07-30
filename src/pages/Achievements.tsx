import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { currentStreak } from '../lib/streak';
import {
  ACHIEVEMENTS,
  type AchievementContext,
  type AchievementDefinition,
} from '../lib/achievements';

const TIER_STYLE: Record<
  AchievementDefinition['tier'],
  { label: string; color: string }
> = {
  bronze: { label: 'Bronze', color: '#d97757' },
  silver: { label: 'Silber', color: '#94a3b8' },
  gold: { label: 'Gold', color: '#fbbf24' },
};

export function Achievements() {
  const areas = useAppStore((s) => s.areas);
  const nodes = useAppStore((s) => s.nodes);
  const logs = useAppStore((s) => s.logs);
  const goals = useAppStore((s) => s.goals);
  const resources = useAppStore((s) => s.resources);
  const unlocks = useAppStore((s) => s.achievements);

  const ctx: AchievementContext = useMemo(
    () => ({
      areas,
      nodes,
      logs,
      goals,
      resources,
      streak: currentStreak(logs),
    }),
    [areas, nodes, logs, goals, resources],
  );

  const unlockedById = new Map(unlocks.map((u) => [u.id, u]));

  // Unlocked badges first, then the ones closest to completion.
  const sorted = [...ACHIEVEMENTS].sort((a, b) => {
    const aUnlocked = unlockedById.has(a.id);
    const bUnlocked = unlockedById.has(b.id);
    if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
    const ratio = (d: AchievementDefinition) => {
      const p = d.progress?.(ctx);
      return p && p.target > 0 ? p.current / p.target : 0;
    };
    return ratio(b) - ratio(a);
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">🏅 Abzeichen</h1>
        <p className="mt-1 text-sm text-slate-400">
          {unlocks.length} von {ACHIEVEMENTS.length} freigeschaltet
        </p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-amber-400 transition-all duration-700"
            style={{
              width: `${(unlocks.length / ACHIEVEMENTS.length) * 100}%`,
            }}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((achievement) => {
          const unlock = unlockedById.get(achievement.id);
          const tier = TIER_STYLE[achievement.tier];
          const progress = achievement.progress?.(ctx);

          return (
            <div
              key={achievement.id}
              className="rounded-2xl border p-4 transition"
              style={{
                borderColor: unlock ? `${tier.color}66` : '#1e293b',
                backgroundColor: unlock
                  ? `${tier.color}0f`
                  : 'rgba(15, 23, 42, 0.4)',
                boxShadow: unlock ? `0 0 20px ${tier.color}22` : 'none',
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="text-3xl"
                  style={{
                    filter: unlock ? 'none' : 'grayscale(1)',
                    opacity: unlock ? 1 : 0.35,
                  }}
                >
                  {unlock ? achievement.icon : '🔒'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-bold ${unlock ? '' : 'text-slate-400'}`}
                    >
                      {achievement.title}
                    </h3>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        backgroundColor: `${tier.color}1a`,
                        color: unlock ? tier.color : '#64748b',
                      }}
                    >
                      {tier.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {achievement.description}
                  </p>

                  {unlock ? (
                    <p className="mt-2 text-xs" style={{ color: tier.color }}>
                      ✓ Freigeschaltet am{' '}
                      {new Date(unlock.unlockedAt).toLocaleDateString('de-DE')}
                    </p>
                  ) : (
                    progress && (
                      <div className="mt-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-slate-600 transition-all"
                            style={{
                              width: `${Math.min((progress.current / progress.target) * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-right text-[11px] text-slate-500">
                          {progress.current.toLocaleString('de-DE')} /{' '}
                          {progress.target.toLocaleString('de-DE')}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
