import { useState } from 'react';
import type { Resource, ResourceType } from '../types/models';
import { RESOURCE_XP, useAppStore } from '../store/useAppStore';
import { RESOURCE_TYPE_META, RESOURCE_TYPES } from '../lib/resourceMeta';
import { createId } from '../lib/id';
import { Modal } from './Modal';

interface ResourceFormModalProps {
  /** Fixed area when opened from an area page; omit to let the user pick. */
  areaId?: string;
  resource: Resource | null;
  onClose: () => void;
}

export function ResourceFormModal({
  areaId,
  resource,
  onClose,
}: ResourceFormModalProps) {
  const areas = useAppStore((s) => s.areas);
  const saveResource = useAppStore((s) => s.saveResource);

  const [title, setTitle] = useState(resource?.title ?? '');
  const [url, setUrl] = useState(resource?.url ?? '');
  const [type, setType] = useState<ResourceType>(resource?.type ?? 'book');
  const [selectedAreaId, setSelectedAreaId] = useState(
    resource?.areaId ?? areaId ?? areas[0]?.id ?? '',
  );

  const submit = async () => {
    if (!title.trim() || !selectedAreaId) return;
    await saveResource({
      id: resource?.id ?? createId(),
      areaId: selectedAreaId,
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

        {!areaId && (
          <label className="block text-sm font-medium text-slate-300">
            Bereich
            <select
              value={selectedAreaId}
              onChange={(e) => setSelectedAreaId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block text-sm font-medium text-slate-300">
          Typ
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ResourceType)}
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          >
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {RESOURCE_TYPE_META[t].icon} {RESOURCE_TYPE_META[t].label} (+
                {RESOURCE_XP[t]} XP)
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
