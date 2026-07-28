import { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Modal } from './Modal';

const XP_PRESETS = [10, 25, 50, 100];

interface ActivityFormModalProps {
  /** Pre-selected area (e.g. when opened from an area page). */
  initialAreaId?: string;
  onClose: () => void;
}

export function ActivityFormModal({
  initialAreaId,
  onClose,
}: ActivityFormModalProps) {
  const areas = useAppStore((s) => s.areas);
  const nodes = useAppStore((s) => s.nodes);
  const logActivity = useAppStore((s) => s.logActivity);

  const [areaId, setAreaId] = useState(initialAreaId ?? areas[0]?.id ?? '');
  const [nodeId, setNodeId] = useState('');
  const [description, setDescription] = useState('');
  const [xp, setXp] = useState(25);

  const area = areas.find((a) => a.id === areaId);
  const areaNodes = useMemo(
    () => nodes.filter((n) => n.areaId === areaId && n.status !== 'completed'),
    [nodes, areaId],
  );

  const submit = async () => {
    if (!areaId || !description.trim() || xp <= 0) return;
    await logActivity({
      areaId,
      nodeId: nodeId || undefined,
      description: description.trim(),
      xp,
    });
    onClose();
  };

  return (
    <Modal title="Aktivität protokollieren" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block text-sm font-medium text-slate-300">
          Bereich
          <select
            value={areaId}
            onChange={(e) => {
              setAreaId(e.target.value);
              setNodeId('');
            }}
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>
        </label>

        {area && area.suggestedActivities.length > 0 && (
          <div>
            <span className="text-xs text-slate-400">Schnellauswahl</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {area.suggestedActivities.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setDescription(s.label);
                    setXp(s.xp);
                  }}
                  className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  {s.label} · {s.xp} XP
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="block text-sm font-medium text-slate-300">
          Was hast du gemacht?
          <input
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="z. B. 30 Minuten gelesen"
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
          />
        </label>

        {areaNodes.length > 0 && (
          <label className="block text-sm font-medium text-slate-300">
            Gehört zu Skill (optional)
            <select
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
            >
              <option value="">– kein Skill –</option>
              {areaNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <div>
          <span className="text-sm font-medium text-slate-300">XP</span>
          <div className="mt-1.5 flex items-center gap-2">
            {XP_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setXp(preset)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                  xp === preset
                    ? 'border-sky-400 bg-sky-400/10 text-sky-300'
                    : 'border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                {preset}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={1000}
              value={xp}
              onChange={(e) => setXp(Number(e.target.value))}
              aria-label="Eigene XP"
              className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-lg py-2.5 font-bold text-slate-950 transition hover:brightness-110"
          style={{ backgroundColor: area?.color ?? '#38bdf8' }}
        >
          +{xp} XP protokollieren
        </button>
      </form>
    </Modal>
  );
}
