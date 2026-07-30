import { useState } from 'react';
import type { Area, Resource } from '../types/models';
import { useAppStore } from '../store/useAppStore';
import { ResourceFormModal } from './ResourceFormModal';
import { ResourceRow } from './ResourceRow';

interface ResourcesTabProps {
  area: Area;
}

export function ResourcesTab({ area }: ResourcesTabProps) {
  const resources = useAppStore((s) => s.resources).filter(
    (r) => r.areaId === area.id,
  );

  const [editing, setEditing] = useState<Resource | null>(null);
  const [showForm, setShowForm] = useState(false);

  const openForm = (resource: Resource | null) => {
    setEditing(resource);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Bücher, Videos und Kurse für {area.name}. Abschließen bringt XP!
        </p>
        <button
          onClick={() => openForm(null)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
        >
          + Neue Ressource
        </button>
      </div>

      {resources.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
          Noch keine Ressourcen. Sammle hier, was du durcharbeiten willst.
        </p>
      ) : (
        resources.map((resource) => (
          <ResourceRow
            key={resource.id}
            resource={resource}
            onEdit={openForm}
          />
        ))
      )}

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
