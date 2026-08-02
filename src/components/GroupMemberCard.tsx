import type { GroupMember } from '../types/groups';

interface GroupMemberCardProps {
  member: GroupMember;
  rank: number;
  isSelf: boolean;
}

const RANK_STYLE: Record<number, string> = {
  1: 'border-amber-400/50 bg-amber-400/10 text-amber-300',
  2: 'border-slate-300/40 bg-slate-300/10 text-slate-200',
  3: 'border-orange-400/40 bg-orange-400/10 text-orange-300',
};

/** One member row: name, character level, streak and the per-area levels. */
export function GroupMemberCard({ member, rank, isSelf }: GroupMemberCardProps) {
  const stats = member.stats;

  return (
    <li
      className={`rounded-2xl border px-4 py-3 transition ${
        isSelf
          ? 'border-sky-500/50 bg-sky-500/5'
          : 'border-slate-800/70 bg-slate-900/40'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
            RANK_STYLE[rank] ?? 'border-slate-700 text-slate-400'
          }`}
        >
          {rank}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-slate-100">
              {member.displayName}
            </span>
            {isSelf && (
              <span className="shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                du
              </span>
            )}
          </div>
          {stats ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
              <span>{stats.totalXp.toLocaleString('de-DE')} XP</span>
              {stats.streak > 0 && (
                <span>
                  🔥 {stats.streak} {stats.streak === 1 ? 'Tag' : 'Tage'}
                </span>
              )}
            </div>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">
              Noch nichts geteilt – meldet sich, sobald die App einmal offen war.
            </p>
          )}
        </div>

        {stats && (
          <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-300">
            Level {stats.level}
          </span>
        )}
      </div>

      {stats && stats.areaLevels.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 pl-12">
          {stats.areaLevels.map((area) => (
            <span
              key={`${area.name}-${area.icon}`}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{
                borderColor: `${area.color}55`,
                backgroundColor: `${area.color}12`,
                color: area.color,
              }}
            >
              {area.icon} {area.name} · {area.level}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
