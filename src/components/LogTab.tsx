import type { Area } from '../types/models';
import { useAppStore } from '../store/useAppStore';

interface LogTabProps {
  area: Area;
}

export function LogTab({ area }: LogTabProps) {
  const logs = useAppStore((s) => s.logs).filter((l) => l.areaId === area.id);
  const nodes = useAppStore((s) => s.nodes);

  if (logs.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
        Noch keine Aktivitäten in diesem Bereich protokolliert.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => {
        const node = log.nodeId
          ? nodes.find((n) => n.id === log.nodeId)
          : undefined;
        return (
          <li
            key={log.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate text-slate-200">{log.description}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {new Date(log.timestamp).toLocaleString('de-DE', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                {node && <> · Skill: {node.title}</>}
              </p>
            </div>
            <span
              className="shrink-0 font-semibold"
              style={{ color: area.color }}
            >
              +{log.xp} XP
            </span>
          </li>
        );
      })}
    </ul>
  );
}
