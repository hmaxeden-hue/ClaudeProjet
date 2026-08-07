import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { buildJournal, formatJournalDay, type JournalDay } from '../lib/journal';
import { dayKey } from '../lib/dailyQuest';

export function Journal() {
  const notes = useAppStore((s) => s.notes);
  const logs = useAppStore((s) => s.logs);
  const nodes = useAppStore((s) => s.nodes);
  const areas = useAppStore((s) => s.areas);

  const days = useMemo(
    () => buildJournal(notes, logs, nodes),
    [notes, logs, nodes],
  );

  // The newest day starts open – that is the one you came to read.
  const [openDay, setOpenDay] = useState<string | null>(days[0]?.day ?? null);

  const areaOf = (areaId: string) => areas.find((a) => a.id === areaId);
  const nodeOf = (nodeId: string) => nodes.find((n) => n.id === nodeId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">📓 Journal</h1>
        <p className="text-sm text-slate-400">
          Jeder Tag, an dem du etwas festgehalten oder geschafft hast. Notizen
          schreibst du direkt bei der jeweiligen Aufgabe.
        </p>
      </div>

      {days.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 px-6 py-12 text-center">
          <div className="text-4xl">📓</div>
          <h2 className="mt-3 text-xl font-bold">Noch nichts festgehalten</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Öffne eine Aufgabe in deinem Skill-Tree und schreib auf, was du
            beobachtest. Alles landet hier, nach Tagen sortiert.
          </p>
          <Link
            to="/"
            className="mt-5 inline-block rounded-lg bg-sky-500 px-5 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400"
          >
            Zum Dashboard
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {days.map((day) => (
            <DayRow
              key={day.day}
              day={day}
              open={openDay === day.day}
              onToggle={() =>
                setOpenDay((current) => (current === day.day ? null : day.day))
              }
              areaOf={areaOf}
              nodeOf={nodeOf}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface DayRowProps {
  day: JournalDay;
  open: boolean;
  onToggle: () => void;
  areaOf: (areaId: string) => { name: string; icon: string; color: string } | undefined;
  nodeOf: (nodeId: string) => { title: string; areaId: string } | undefined;
}

function DayRow({ day, open, onToggle, areaOf, nodeOf }: DayRowProps) {
  const xp = day.activities.reduce((sum, l) => sum + l.xp, 0);
  const isToday = day.day === dayKey();

  return (
    <li
      className={`overflow-hidden rounded-2xl border transition ${
        open
          ? 'border-slate-700 bg-slate-900/60'
          : 'border-slate-800/70 bg-slate-900/30'
      }`}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`font-semibold ${isToday ? 'text-sky-300' : 'text-slate-100'}`}
            >
              {formatJournalDay(day.day)}
            </span>
            {day.notes.length > 0 && (
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                📝 {day.notes.length}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {[
              day.notes.length > 0 &&
                `${day.notes.length} ${day.notes.length === 1 ? 'Notiz' : 'Notizen'}`,
              day.activities.length > 0 &&
                `${day.activities.length} ${
                  day.activities.length === 1 ? 'Aktivität' : 'Aktivitäten'
                }`,
              day.completedNodes.length > 0 &&
                `${day.completedNodes.length} ${
                  day.completedNodes.length === 1 ? 'Skill' : 'Skills'
                } abgeschlossen`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {xp > 0 && (
            <span className="text-sm font-semibold text-amber-300">+{xp} XP</span>
          )}
          <span className="text-slate-500">{open ? '▾' : '▸'}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-800 px-4 py-4">
          {day.notes.length === 0 && (
            <p className="text-sm text-slate-500">
              An diesem Tag keine Notizen — nur Fortschritt.
            </p>
          )}

          {day.notes.map((note) => {
            const area = areaOf(note.areaId);
            const node = nodeOf(note.nodeId);
            return (
              <div
                key={note.id}
                className="rounded-xl border-l-2 bg-slate-950/50 py-2 pl-3 pr-3"
                style={{ borderColor: area?.color ?? '#334155' }}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="text-slate-400">
                    {new Date(note.createdAt).toLocaleTimeString('de-DE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {node && area && (
                    <Link
                      to={`/area/${note.areaId}`}
                      className="truncate transition hover:underline"
                      style={{ color: area.color }}
                    >
                      {area.icon} {node.title}
                    </Link>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
                  {note.text}
                </p>
              </div>
            );
          })}

          {(day.completedNodes.length > 0 || day.activities.length > 0) && (
            <div className="space-y-1 border-t border-slate-800/70 pt-3">
              {day.completedNodes.map((node) => {
                const area = areaOf(node.areaId);
                return (
                  <div key={node.id} className="flex items-center gap-2 text-xs">
                    <span>✅</span>
                    <span className="text-slate-300">{node.title}</span>
                    {area && (
                      <span className="text-slate-600">
                        {area.icon} {area.name}
                      </span>
                    )}
                  </div>
                );
              })}
              {day.activities.map((log) => {
                const area = areaOf(log.areaId);
                return (
                  <div key={log.id} className="flex items-center gap-2 text-xs">
                    <span>{area?.icon ?? '•'}</span>
                    <span className="truncate text-slate-400">
                      {log.description}
                    </span>
                    <span className="shrink-0 text-slate-600">+{log.xp} XP</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
