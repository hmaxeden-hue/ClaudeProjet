import { useState } from 'react';
import type { Area } from '../types/models';
import { useAppStore } from '../store/useAppStore';
import { createId } from '../lib/id';
import { Modal } from './Modal';

const COLOR_PRESETS = [
  '#38bdf8',
  '#a78bfa',
  '#34d399',
  '#fb7185',
  '#fbbf24',
  '#f472b6',
  '#22d3ee',
  '#a3e635',
  '#fb923c',
  '#94a3b8',
];

const ICON_PRESETS = ['⭐', '🎨', '🎸', '💻', '🌍', '🧠', '🤝', '🏡', '🌱', '🎯'];

interface AreaFormModalProps {
  /** Existing area to edit, or null to create a new one. */
  area: Area | null;
  onClose: () => void;
}

export function AreaFormModal({ area, onClose }: AreaFormModalProps) {
  const saveArea = useAppStore((s) => s.saveArea);
  const areas = useAppStore((s) => s.areas);

  const [name, setName] = useState(area?.name ?? '');
  const [description, setDescription] = useState(area?.description ?? '');
  const [icon, setIcon] = useState(area?.icon ?? ICON_PRESETS[0]);
  const [color, setColor] = useState(area?.color ?? COLOR_PRESETS[0]);

  const submit = async () => {
    if (!name.trim()) return;
    const maxOrder = Math.max(0, ...areas.map((a) => a.sortOrder));
    await saveArea({
      id: area?.id ?? createId(),
      name: name.trim(),
      icon,
      color,
      description: description.trim(),
      xp: area?.xp ?? 0,
      sortOrder: area?.sortOrder ?? maxOrder + 1,
      isCustom: area?.isCustom ?? true,
      suggestedActivities: area?.suggestedActivities ?? [],
    });
    onClose();
  };

  return (
    <Modal title={area ? 'Bereich bearbeiten' : 'Neuer Bereich'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block text-sm font-medium text-slate-300">
          Name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Musik, Kochen, Sprachen …"
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          />
        </label>
        <label className="block text-sm font-medium text-slate-300">
          Beschreibung
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          />
        </label>
        <div>
          <span className="text-sm font-medium text-slate-300">Icon</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {ICON_PRESETS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                className={`rounded-lg border p-2 text-xl transition ${
                  icon === i
                    ? 'border-sky-400 bg-sky-400/10'
                    : 'border-slate-700 hover:border-slate-500'
                }`}
              >
                {i}
              </button>
            ))}
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
              aria-label="Eigenes Icon"
              className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 text-center text-xl focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <span className="text-sm font-medium text-slate-300">Farbe</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Farbe ${c}`}
                className={`h-8 w-8 rounded-full border-2 transition ${
                  color === c ? 'scale-110 border-white' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-sky-500 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400"
        >
          {area ? 'Speichern' : 'Bereich anlegen'}
        </button>
      </form>
    </Modal>
  );
}
