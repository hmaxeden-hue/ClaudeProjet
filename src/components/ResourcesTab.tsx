import { useState } from 'react';
import type { Area, Resource, ResourceType } from '../types/models';
import { RESOURCE_XP, useAppStore } from '../store/useAppStore';
import { createId } from '../lib/id';
import { Modal } from './Modal';

const TYPE_META: Record<ResourceType, { label: string; icon: string }> = {
  book: { label: 'Buch', icon: '📖' },
  video: { label: 'Video', icon: '🎬' },
  course: { label: 'Kurs', icon: '🎓' },
  other: { label: 'Sonstiges', icon: '🔗' },
};

const STATUS_META: Record<Resource['status'], string> = {
  todo: 'Offen',
  in_progress: 'In Arbeit',
  done: 'Fertig',
};

interface ResourcesTabProps {
  area: Area;
}

export function ResourcesTab({ area }: ResourcesTabProps) {
  const resources = useAppStore((s) => s.resources).filter(
    (r) => r.areaId === area.id,
  );
  const setResourceStatus = useAppStore((s) => s.setResourceStatus);
  const deleteResource = useAppStore((s) => s.deleteResource);

  const [editing, setEditing] = useState<Resource | null>(null);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Bücher, Videos und Kurse für {area.name}. Abschließen bringt XP!
        </p>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
        >
          + Neue Ressource
        </button>
      </div>

      {resources.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
          Noch keine Ressourcen. Sammle hier, was du durcharbeiten willst.
        </p>
      )}

      {resources.map((resource) => (
        <div
          key={resource.id}
          className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${
            resource.status === 'done'
              ? 'border-slate-800/60 bg-slate-900/30'
              : 'border-slate-800 bg-slate-900/60'
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-xl">{TYPE_META[resource.type].icon}</span>
            <div className="min-w-0">
              <h3
                className={`truncate font-semibold ${
                  resource.status === 'done' ? 'text-slate-500 line-through' : ''
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
              <p className="text-xs text-slate-500">
                {TYPE_META[resource.type].label} · +
                {RESOURCE_XP[resource.type]} XP bei Abschluss
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
              {(Object.keys(STATUS_META) as Resource['status'][]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s]}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setEditing(resource);
                setShowForm(true);
              }}
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
      ))}

      {showForm && (
        <ResourceFormModal
          areaId={area.id}
          resource={editing}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function ResourceFormModal({
  areaId,
  resource,
  onClose,
}: {
  areaId: string;
  resource: Resource | null;
  onClose: () => void;
}) {
  const saveResource = useAppStore((s) => s.saveResource);
  const [title, setTitle] = useState(resource?.title ?? '');
  const [url, setUrl] = useState(resource?.url ?? '');
  const [type, setType] = useState<ResourceType>(resource?.type ?? 'book');

  const submit = async () => {
    if (!title.trim()) return;
    await saveResource({
      id: resource?.id ?? createId(),
      areaId,
      nodeId: resource?.nodeId,
      type,
      title: title.trim(),
      url: url.trim() || undefined,
      status: resource?.status ?? 'todo',
    });
    onClose();
  };

  return (
    <Modal
      title={resource ? 'Ressource bearbeiten' : 'Neue Ressource'}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block text-sm font-medium text-slate-300">
          Titel
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Atomic Habits"
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          />
        </label>
        <label className="block text-sm font-medium text-slate-300">
          Typ
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ResourceType)}
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          >
            {(Object.keys(TYPE_META) as ResourceType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t].icon} {TYPE_META[t].label} (+{RESOURCE_XP[t]} XP)
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-300">
          URL (optional)
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-sky-500 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400"
        >
          {resource ? 'Speichern' : 'Ressource anlegen'}
        </button>
      </form>
    </Modal>
  );
}
