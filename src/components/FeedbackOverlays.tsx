import { useAppStore } from '../store/useAppStore';

/** Floating "+X XP" toast and the full-screen level-up celebration. */
export function FeedbackOverlays() {
  const xpToast = useAppStore((s) => s.xpToast);
  const levelUp = useAppStore((s) => s.levelUp);

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
    </>
  );
}
