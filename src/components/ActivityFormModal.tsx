import { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  ACTIVITY_SCOPES,
  GENERIC_ACTIVITIES,
  SCOPE_META,
  xpForActivity,
  type ActivityScope,
} from '../lib/xp';
import { Modal } from './Modal';

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

  /** Cap kept low so tagging everything everywhere stays unattractive. */
  const MAX_EXTRA_AREAS = 2;

  /** Overlapping areas of the chosen area start out ticked. */
  const linkedOf = (id: string) =>
    (areas.find((a) => a.id === id)?.linkedAreaIds ?? [])
      .filter((linked) => linked !== id && areas.some((a) => a.id === linked))
      .slice(0, MAX_EXTRA_AREAS);

  const startAreaId = initialAreaId ?? areas[0]?.id ?? '';
  const [areaId, setAreaId] = useState(startAreaId);
  const [nodeId, setNodeId] = useState('');
  const [activityIndex, setActivityIndex] = useState(0);
  const [note, setNote] = useState('');
  const [scope, setScope] = useState<ActivityScope>('normal');
  const [alsoAreaIds, setAlsoAreaIds] = useState<string[]>(() =>
    linkedOf(startAreaId),
  );

  const area = areas.find((a) => a.id === areaId);

  // Areas created before the catalog existed fall back to the generic one.
  const catalog = useMemo(
    () =>
      area && area.suggestedActivities.length > 0
        ? area.suggestedActivities
        : GENERIC_ACTIVITIES,
    [area],
  );

  const activity = catalog[Math.min(activityIndex, catalog.length - 1)];
  const xp = activity ? xpForActivity(activity.xp, scope) : 0;

  const areaNodes = useMemo(
    () => nodes.filter((n) => n.areaId === areaId && n.status !== 'completed'),
    [nodes, areaId],
  );

  const toggleAlso = (id: string) => {
    setAlsoAreaIds((prev) =>
      prev.includes(id)
        ? prev.filter((a) => a !== id)
        : prev.length >= MAX_EXTRA_AREAS
          ? prev
          : [...prev, id],
    );
  };

  const submit = async () => {
    if (!areaId || !activity) return;
    const description = note.trim()
      ? `${activity.label} – ${note.trim()}`
      : activity.label;
    await logActivity({
      areaId,
      secondaryAreaIds: alsoAreaIds,
      nodeId: nodeId || undefined,
      description,
      scope,
      baseXp: activity.xp,
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
              setActivityIndex(0);
              setAlsoAreaIds(linkedOf(e.target.value));
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

        <div>
          <span className="text-sm font-medium text-slate-300">
            Was hast du gemacht?
          </span>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {catalog.map((entry, index) => {
              const selected = index === activityIndex;
              return (
                <button
                  key={entry.label}
                  type="button"
                  onClick={() => setActivityIndex(index)}
                  className="rounded-lg border px-3 py-2 text-left text-sm transition"
                  style={{
                    borderColor: selected ? (area?.color ?? '#38bdf8') : '#334155',
                    backgroundColor: selected
                      ? `${area?.color ?? '#38bdf8'}14`
                      : 'transparent',
                  }}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-slate-300">Umfang</span>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {ACTIVITY_SCOPES.map((value) => {
              const selected = value === scope;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  className="rounded-lg border px-2 py-2 text-center transition"
                  style={{
                    borderColor: selected ? (area?.color ?? '#38bdf8') : '#334155',
                    backgroundColor: selected
                      ? `${area?.color ?? '#38bdf8'}14`
                      : 'transparent',
                  }}
                >
                  <div className="text-sm font-semibold">
                    {SCOPE_META[value].label}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {SCOPE_META[value].hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {areas.length > 1 && (
          <div>
            <span className="text-sm font-medium text-slate-300">
              Zählt außerdem für
            </span>
            <span className="ml-1 text-sm font-normal text-slate-500">
              (optional)
            </span>
            <p className="text-xs text-slate-500">
              Jeder gewählte Bereich bekommt die vollen {xp} XP — für Dinge, die
              wirklich beides voranbringen.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {areas
                .filter((a) => a.id !== areaId)
                .map((a) => {
                  const selected = alsoAreaIds.includes(a.id);
                  const blocked =
                    !selected && alsoAreaIds.length >= MAX_EXTRA_AREAS;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAlso(a.id)}
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

        <label className="block text-sm font-medium text-slate-300">
          Notiz
          <span className="ml-1 font-normal text-slate-500">(optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Kapitel 4–6"
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm placeholder-slate-600 focus:border-sky-500 focus:outline-none"
          />
        </label>

        {areaNodes.length > 0 && (
          <label className="block text-sm font-medium text-slate-300">
            Gehört zu Skill
            <span className="ml-1 font-normal text-slate-500">(optional)</span>
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

        <button
          type="submit"
          disabled={!activity}
          className="w-full rounded-lg py-2.5 font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
          style={{ backgroundColor: area?.color ?? '#38bdf8' }}
        >
          +{xp} XP protokollieren
          {alsoAreaIds.length > 0 && ` × ${alsoAreaIds.length + 1} Bereiche`}
        </button>

        <p className="text-center text-xs text-slate-500">
          Die XP ergeben sich aus Aktivität und Umfang — so bleiben Level
          zwischen Bereichen und über die Zeit vergleichbar.
        </p>
      </form>
    </Modal>
  );
}
