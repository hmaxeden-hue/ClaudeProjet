import { levelProgress } from '../lib/xp';

interface XPBarProps {
  xp: number;
  color: string;
  showNumbers?: boolean;
}

export function XPBar({ xp, color, showNumbers = true }: XPBarProps) {
  const { current, needed, ratio } = levelProgress(xp);

  return (
    <div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="xp-bar-fill h-full rounded-full transition-all duration-700"
          style={{ width: `${ratio * 100}%`, backgroundColor: color }}
        />
      </div>
      {showNumbers && (
        <div className="mt-1 text-right text-xs text-slate-400">
          {current.toLocaleString('de-DE')} / {needed.toLocaleString('de-DE')} XP
        </div>
      )}
    </div>
  );
}
