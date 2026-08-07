import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { dailyQuestBonus, dayKey } from '../lib/dailyQuest';
import { HowToList } from './HowToList';
import { QuickNoteModal } from './QuickNoteModal';

/**
 * Today's highlighted skill. Stays visible after being finished so the day
 * reads as done instead of simply swapping in the next quest.
 */
export function DailyQuestCard() {
  const quest = useAppStore((s) => s.profile?.dailyQuest);
  const nodes = useAppStore((s) => s.nodes);
  const areas = useAppStore((s) => s.areas);
  const completeNode = useAppStore((s) => s.completeNode);
  const [writingNote, setWritingNote] = useState(false);

  if (!quest || quest.day !== dayKey()) return null;

  const node = nodes.find((n) => n.id === quest.nodeId);
  const area = node && areas.find((a) => a.id === node.areaId);
  if (!node || !area) return null;

  const bonus = dailyQuestBonus(node.xpReward);
  const done = quest.completed;

  return (
    <section
      className="rounded-2xl border p-5"
      style={{
        borderColor: done ? '#334155' : 'rgba(251, 191, 36, 0.45)',
        backgroundColor: done
          ? 'rgba(15, 23, 42, 0.5)'
          : 'rgba(251, 191, 36, 0.07)',
        boxShadow: done ? 'none' : '0 0 30px rgba(251, 191, 36, 0.10)',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-amber-300">
            <span>⚡ Tagesquest</span>
            {!done && (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5">
                +{bonus} XP Bonus, wenn du sie heute schaffst
              </span>
            )}
          </div>
          <h2 className="mt-1.5 text-xl font-bold text-white">{node.title}</h2>
          <Link
            to={`/area/${area.id}`}
            className="mt-0.5 inline-block text-sm transition hover:underline"
            style={{ color: area.color }}
          >
            {area.icon} {area.name}
          </Link>
          {node.description && (
            <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
              {node.description}
            </p>
          )}
        </div>

        {done ? (
          <span className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-300">
            ✓ Heute erledigt · +{bonus} XP Bonus
          </span>
        ) : (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setWritingNote(true)}
              className="rounded-lg border border-slate-700 px-3 py-2.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
              title="Notiz zu dieser Aufgabe"
            >
              📝
            </button>
            <button
              onClick={() => void completeNode(node.id)}
              className="rounded-lg bg-amber-400 px-5 py-2.5 font-bold text-slate-950 shadow-lg shadow-amber-400/20 transition hover:bg-amber-300"
            >
              ✓ Erledigt (+{node.xpReward + bonus} XP)
            </button>
          </div>
        )}
      </div>

      {!done && node.howTo && node.howTo.length > 0 && (
        <div className="mt-4 border-t border-amber-400/20 pt-3">
          <HowToList steps={node.howTo} color="#fbbf24" dense />
        </div>
      )}

      {writingNote && (
        <QuickNoteModal node={node} onClose={() => setWritingNote(false)} />
      )}
    </section>
  );
}
