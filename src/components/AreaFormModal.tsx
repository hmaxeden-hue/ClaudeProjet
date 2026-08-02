import { useState } from 'react';
import type { Area } from '../types/models';
import { useAppStore } from '../store/useAppStore';
import { createId } from '../lib/id';
import { GENERIC_ACTIVITIES } from '../lib/xp';
import { buildCustomArea, type ExperienceLevel } from '../data/onboarding';
import { fetchGeneratedTree } from '../lib/ai';
import { useAuthStore } from '../store/useAuthStore';
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

const EXPERIENCE_OPTIONS: {
  value: ExperienceLevel;
  label: string;
  hint: string;
}[] = [
  { value: 'beginner', label: 'Am Anfang', hint: 'Ich fange gerade an' },
  { value: 'intermediate', label: 'Schon dabei', hint: 'Grundlagen sitzen' },
  {
    value: 'advanced',
    label: 'Fortgeschritten',
    hint: 'Ich arbeite an Feinheiten',
  },
];

interface AreaFormModalProps {
  /** Existing area to edit, or null to create a new one. */
  area: Area | null;
  onClose: () => void;
}

export function AreaFormModal({ area, onClose }: AreaFormModalProps) {
  const saveArea = useAppStore((s) => s.saveArea);
  const addAreaWithTree = useAppStore((s) => s.addAreaWithTree);
  const areas = useAppStore((s) => s.areas);
  const isSignedIn = useAuthStore((s) => s.status) === 'signed_in';

  const [name, setName] = useState(area?.name ?? '');
  const [description, setDescription] = useState(area?.description ?? '');
  const [icon, setIcon] = useState(area?.icon ?? ICON_PRESETS[0]);
  const [color, setColor] = useState(area?.color ?? COLOR_PRESETS[0]);
  const [linkedAreaIds, setLinkedAreaIds] = useState<string[]>(
    area?.linkedAreaIds ?? [],
  );

  // Only offered for new areas – an existing tree is never overwritten.
  const canGenerate = !area && isSignedIn;
  const [withTree, setWithTree] = useState(canGenerate);
  const [experience, setExperience] = useState<ExperienceLevel>('beginner');
  const [goalText, setGoalText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /** Cap matches the activity form – overlap should stay meaningful. */
  const MAX_LINKED = 2;

  const toggleLinked = (id: string) => {
    setLinkedAreaIds((prev) =>
      prev.includes(id)
        ? prev.filter((a) => a !== id)
        : prev.length >= MAX_LINKED
          ? prev
          : [...prev, id],
    );
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setError('');

    const maxOrder = Math.max(0, ...areas.map((a) => a.sortOrder));
    const shell = {
      id: area?.id ?? createId(),
      name: trimmed,
      icon,
      color,
      description: description.trim(),
      sortOrder: area?.sortOrder ?? maxOrder + 1,
      isCustom: area?.isCustom ?? true,
      suggestedActivities: area?.suggestedActivities?.length
        ? area.suggestedActivities
        : GENERIC_ACTIVITIES,
      linkedAreaIds,
    };

    if (!area && withTree) {
      setBusy(true);
      try {
        const nodes = await fetchGeneratedTree({
          areaName: trimmed,
          areaDescription: shell.description,
          experience,
          focus: [],
          overlaps: linkedAreaIds
            .map((id) => areas.find((a) => a.id === id)?.name)
            .filter((n): n is string => Boolean(n)),
          goalText,
        });
        await addAreaWithTree(
          buildCustomArea(shell, { experience, tags: [], goalText }, nodes),
        );
        onClose();
      } catch (e) {
        // The area itself is never lost because of a failed AI call – the
        // user can simply create it without a tree.
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }

    await saveArea({ ...shell, xp: area?.xp ?? 0 });
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
            placeholder="z. B. Spanisch, Musik, Kochen …"
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          />
        </label>
        <label className="block text-sm font-medium text-slate-300">
          Beschreibung
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Was willst du in diesem Bereich erreichen?"
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
          />
        </label>

        {areas.filter((a) => a.id !== area?.id).length > 0 && (
          <div>
            <span className="text-sm font-medium text-slate-300">
              Überschneidet sich mit
            </span>
            <span className="ml-1 text-sm font-normal text-slate-500">
              (optional)
            </span>
            <p className="text-xs text-slate-500">
              Spanisch trainiert auch Kommunikation. Gewählte Bereiche sind beim
              Protokollieren vorausgewählt und bekommen die vollen XP.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {areas
                .filter((a) => a.id !== area?.id)
                .map((a) => {
                  const selected = linkedAreaIds.includes(a.id);
                  const blocked =
                    !selected && linkedAreaIds.length >= MAX_LINKED;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleLinked(a.id)}
                      disabled={blocked}
                      className="rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-30"
                      style={{
                        borderColor: selected ? a.color : '#334155',
                        backgroundColor: selected ? `${a.color}1a` : 'transparent',
                        color: selected ? a.color : '#cbd5e1',
                      }}
                    >
                      {a.icon} {a.name}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {canGenerate && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={withTree}
                onChange={(e) => setWithTree(e.target.checked)}
                className="mt-1 h-4 w-4 accent-sky-500"
              />
              <span>
                <span className="text-sm font-medium text-slate-200">
                  Skill-Baum von der KI entwerfen lassen
                </span>
                <span className="block text-xs text-slate-500">
                  Sonst startest du mit einem leeren Baum und legst die Skills
                  selbst an.
                </span>
              </span>
            </label>

            {withTree && (
              <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
                <div>
                  <span className="text-sm font-medium text-slate-300">
                    Wo stehst du?
                  </span>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {EXPERIENCE_OPTIONS.map((option) => {
                      const selected = option.value === experience;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setExperience(option.value)}
                          className="rounded-lg border px-2 py-2 text-center transition"
                          style={{
                            borderColor: selected ? color : '#334155',
                            backgroundColor: selected
                              ? `${color}14`
                              : 'transparent',
                          }}
                        >
                          <div className="text-sm font-semibold">
                            {option.label}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {option.hint}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="block text-sm font-medium text-slate-300">
                  Ziel
                  <span className="ml-1 font-normal text-slate-500">
                    (optional)
                  </span>
                  <input
                    value={goalText}
                    onChange={(e) => setGoalText(e.target.value)}
                    placeholder="z. B. ein Gespräch auf Spanisch führen"
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                  />
                </label>
              </div>
            )}
          </div>
        )}

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

        {error && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error} – du kannst den Bereich auch ohne KI-Baum anlegen.
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="w-full rounded-lg bg-sky-500 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-40"
        >
          {busy
            ? 'Baum wird entworfen …'
            : area
              ? 'Speichern'
              : withTree
                ? 'Bereich mit Baum anlegen'
                : 'Bereich anlegen'}
        </button>
      </form>
    </Modal>
  );
}
