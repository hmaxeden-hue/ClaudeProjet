import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ACHIEVEMENTS_BY_ID } from '../lib/achievements';

/** Floating "+X XP" toast, level-up celebration and achievement unlocks. */
export function FeedbackOverlays() {
  const xpToast = useAppStore((s) => s.xpToast);
  const levelUp = useAppStore((s) => s.levelUp);
  const pendingAchievements = useAppStore((s) => s.pendingAchievements);
  const dismissAchievement = useAppStore((s) => s.dismissAchievement);

  const currentAchievementId = pendingAchievements[0];
  const achievement = currentAchievementId
    ? ACHIEVEMENTS_BY_ID.get(currentAchievementId)
    : undefined;

  // Show unlocked badges one after another.
  useEffect(() => {
    if (!currentAchievementId) return;
    const timer = window.setTimeout(dismissAchievement, 4000);
    return () => window.clearTimeout(timer);
  }, [currentAchievementId, dismissAchievement]);

  return (
    <>
      {xpToast && (
        <div
          key={xpToast.id}
          className="animate-xp-float pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2"
        >
          <span
            className="rounded-full px-5 py-2 text-xl font-bold shadow-lg"
            style={{
              color: xpToast.color,
              backgroundColor: 'rgba(2, 6, 23, 0.9)',
              border: `1px solid ${xpToast.color}66`,
              boxShadow: `0 0 24px ${xpToast.color}44`,
            }}
          >
            +{xpToast.amount} XP
            {xpToast.areaCount > 1 && (
              <span className="ml-1 text-sm font-semibold opacity-80">
                × {xpToast.areaCount}
              </span>
            )}
          </span>
        </div>
      )}

      {levelUp && (
        <div
          key={`lvl-${levelUp.id}`}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
        >
          <div
            className="animate-level-up rounded-2xl border px-10 py-8 text-center shadow-2xl"
            style={{
              backgroundColor: 'rgba(2, 6, 23, 0.95)',
              borderColor: `${levelUp.color}88`,
              boxShadow: `0 0 60px ${levelUp.color}55`,
            }}
          >
            <div className="text-5xl">{levelUp.areaIcon}</div>
            <div
              className="mt-3 text-3xl font-extrabold tracking-tight"
              style={{ color: levelUp.color }}
            >
              LEVEL UP!
            </div>
            <div className="mt-2 text-lg text-slate-200">
              {levelUp.areaName} ist jetzt{' '}
              <span className="font-bold">Level {levelUp.level}</span>
            </div>
          </div>
        </div>
      )}

      {achievement && (
        <div
          key={achievement.id}
          className="fixed left-1/2 top-20 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0"
        >
          <button
            onClick={dismissAchievement}
            className="animate-badge-drop w-full rounded-2xl border border-amber-400/60 bg-slate-950/95 px-6 py-4 shadow-2xl"
            style={{ boxShadow: '0 0 40px rgba(251, 191, 36, 0.35)' }}
          >
            <div className="text-xs font-bold uppercase tracking-widest text-amber-400">
              Abzeichen freigeschaltet
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-4xl">{achievement.icon}</span>
              <div className="text-left">
                <div className="font-bold text-white">{achievement.title}</div>
                <div className="text-xs text-slate-400">
                  {achievement.description}
                </div>
              </div>
            </div>
          </button>
        </div>
      )}
    </>
  );
}
