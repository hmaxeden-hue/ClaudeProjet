import { useState } from 'react';
import type { NodeType, SkillNode } from '../types/models';
import { useAppStore } from '../store/useAppStore';
import { createId } from '../lib/id';
import { Modal } from './Modal';

const TYPE_OPTIONS: { value: NodeType; label: string }[] = [
  { value: 'quest', label: '📜 Quest' },
  { value: 'habit', label: '🔁 Gewohnheit' },
  { value: 'milestone', label: '🏆 Meilenstein' },
];

interface NodeFormModalProps {
  areaId: string;
  /** Existing node to edit, or null to create a new one. */
  node: SkillNode | null;
  onClose: () => void;
}

export function NodeFormModal({ areaId, node, onClose }: NodeFormModalProps) {
  const nodes = useAppStore((s) => s.nodes);
  const saveNode = useAppStore((s) => s.saveNode);

  const [title, setTitle] = useState(node?.title ?? '');
  const [description, setDescription] = useState(node?.description ?? '');
  const [type, setType] = useState<NodeType>(node?.type ?? 'quest');
  const [xpReward, setXpReward] = useState(node?.xpReward ?? 50);
  const [prerequisites, setPrerequisites] = useState<string[]>(
    node?.prerequisites ?? [],
  );

  // A node cannot depend on itself; deeper cycle checks happen in lib/tree.
  const prereqCandidates = nodes.filter(
    (n) => n.areaId === areaId && n.id !== node?.id,
  );

  const togglePrereq = (id: string) => {
    setPrerequisites((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const submit = async () => {
    if (!title.trim() || xpReward <= 0) return;
    await saveNode({
      id: node?.id ?? createId(),
      areaId,
      title: title.trim(),
      description: description.trim(),
      prerequisites,
      xpReward,
      type,
      status: node?.status,
      completedAt: node?.completedAt,
    });
    onClose();
  };

  return (
    <Modal title={node ? 'Skill bearbeiten' : 'Neuer Skill'} onClose={onClose}>
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
            placeholder="z. B. Erstes Buch fertiggelesen"
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

        <div className="flex gap-4">
          <label className="block flex-1 text-sm font-medium text-slate-300">
            Typ
            <select
              value={type}
              onChange={(e) => setType(e.target.value as NodeType)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block w-28 text-sm font-medium text-slate-300">
            XP-Belohnung
            <input
              type="number"
              min={1}
              max={1000}
              value={xpReward}
              onChange={(e) => setXpReward(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus:border-sky-500 focus:outline-none"
            />
          </label>
        </div>

        {prereqCandidates.length > 0 && (
          <div>
            <span className="text-sm font-medium text-slate-300">
              Voraussetzungen
            </span>
            <p className="text-xs text-slate-500">
              Dieser Skill wird erst verfügbar, wenn alle gewählten Skills
              abgeschlossen sind.
            </p>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-800 p-2">
              {prereqCandidates.map((n) => (
                <label
                  key={n.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-800/60"
                >
                  <input
                    type="checkbox"
                    checked={prerequisites.includes(n.id)}
                    onChange={() => togglePrereq(n.id)}
                    className="accent-sky-500"
                  />
                  <span className="text-slate-300">{n.title}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-sky-500 py-2.5 font-bold text-slate-950 transition hover:bg-sky-400"
        >
          {node ? 'Speichern' : 'Skill anlegen'}
        </button>
      </form>
    </Modal>
  );
}
