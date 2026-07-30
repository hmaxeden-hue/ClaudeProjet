import { useMemo, useState } from 'react';
import type { Resource, ResourceType } from '../types/models';
import { useAppStore } from '../store/useAppStore';
import {
  RESOURCE_STATUS_LABEL,
  RESOURCE_STATUSES,
  RESOURCE_TYPE_META,
  RESOURCE_TYPES,
} from '../lib/resourceMeta';
import { ResourceFormModal } from '../components/ResourceFormModal';
import { ResourceRow } from '../components/ResourceRow';

type AreaFilter = string | 'all';
type TypeFilter = ResourceType | 'all';
type StatusFilter = Resource['status'] | 'all';

export function Library() {
  const resources = useAppStore((s) => s.resources);
  const areas = useAppStore((s) => s.areas);

  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Resource | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return resources.filter(
      (r) =>
        (areaFilter === 'all' || r.areaId === areaFilter) &&
        (typeFilter === 'all' || r.type === typeFilter) &&
        (statusFilter === 'all' || r.status === statusFilter) &&
        (query === '' || r.title.toLowerCase().includes(query)),
    );
  }, [resources, areaFilter, typeFilter, statusFilter, search]);

  const doneCount = resources.filter((r) => r.status === 'done').length;
  const inProgressCount = resources.filter(
    (r) => r.status === 'in_progress',
  ).length;

  const openForm = (resource: Resource | null) => {
    setEditing(resource);
    setShowForm(true);
  };

  const selectClass =
    'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            📚 Bibliothek
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {resources.length} Ressourcen · {inProgressCount} in Arbeit ·{' '}
            {doneCount} abgeschlossen
          </p>
        </div>
        <button
          onClick={() => openForm(null)}
          className="rounded-xl bg-sky-500 px-4 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400"
        >
          + Neue Ressource
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen …"
          className={`${selectClass} flex-1 min-w-40`}
        />
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className={selectClass}
          aria-label="Bereich filtern"
        >
          <option value="all">Alle Bereiche</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.name}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className={selectClass}
          aria-label="Typ filtern"
        >
          <option value="all">Alle Typen</option>
          {RESOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {RESOURCE_TYPE_META[t].icon} {RESOURCE_TYPE_META[t].label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className={selectClass}
          aria-label="Status filtern"
        >
          <option value="all">Alle Status</option>
          {RESOURCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {RESOURCE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
            {resources.length === 0
              ? 'Deine Bibliothek ist noch leer. Sammle hier Bücher, Videos und Kurse, die du durcharbeiten willst.'
              : 'Keine Ressource passt zu diesen Filtern.'}
          </p>
        ) : (
          filtered.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              showArea
              onEdit={openForm}
            />
          ))
        )}
      </div>

      {showForm && (
        <ResourceFormModal
          resource={editing}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
