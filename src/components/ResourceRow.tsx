import type { Resource } from '../types/models';
import { RESOURCE_XP, useAppStore } from '../store/useAppStore';
import {
  RESOURCE_STATUS_LABEL,
  RESOURCE_STATUSES,
  RESOURCE_TYPE_META,
} from '../lib/resourceMeta';

interface ResourceRowProps {
  resource: Resource;
  /** Show which area the resource belongs to (used in the library view). */
  showArea?: boolean;
  onEdit: (resource: Resource) => void;
}

export function ResourceRow({ resource, showArea, onEdit }: ResourceRowProps) {
  const areas = useAppStore((s) => s.areas);
  const setResourceStatus = useAppStore((s) => s.setResourceStatus);
  const deleteResource = useAppStore((s) => s.deleteResource);

  const area = areas.find((a) => a.id === resource.areaId);
  const isDone = resource.status === 'done';

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
        isDone
          ? 'border-slate-800/60 bg-slate-900/30'
          : 'border-slate-800 bg-slate-900/60'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="text-xl">{RESOURCE_TYPE_META[resource.type].icon}</span>
        <div className="min-w-0">
          <h3
            className={`truncate font-semibold ${
              isDone ? 'text-slate-500 line-through' : ''
            }`}
          >
            {resource.url ? (
              <a
                href={resource.url}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {resource.title} ↗
              </a>
            ) : (
              resource.title
            )}
          </h3>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {showArea && area && (
              <span
                className="rounded-full px-2 py-0.5 font-medium"
                style={{
                  backgroundColor: `${area.color}1a`,
                  color: area.color,
                }}
              >
                {area.icon} {area.name}
              </span>
            )}
            <span>
              {RESOURCE_TYPE_META[resource.type].label} · +
              {RESOURCE_XP[resource.type]} XP bei Abschluss
            </span>
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <select
          value={resource.status}
          onChange={(e) =>
            void setResourceStatus(
              resource.id,
              e.target.value as Resource['status'],
            )
          }
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
          aria-label="Status"
        >
          {RESOURCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {RESOURCE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          onClick={() => onEdit(resource)}
          className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-sm text-slate-400 hover:text-white"
          aria-label="Ressource bearbeiten"
        >
          ✎
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Ressource "${resource.title}" löschen?`)) {
              void deleteResource(resource.id);
            }
          }}
          className="rounded-lg border border-slate-800 px-2.5 py-1.5 text-sm text-rose-400 hover:border-rose-500"
          aria-label="Ressource löschen"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
