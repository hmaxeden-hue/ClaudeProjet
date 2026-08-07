import { useEffect, useState } from 'react';
import type { Area } from '../types/models';
import { useAppStore } from '../store/useAppStore';
import { fetchNodeSuggestions, type NodeSuggestion } from '../lib/ai';
import { levelFromXp } from '../lib/xp';
import { nodeDepths } from '../lib/tree';
import { createId } from '../lib/id';
import { Modal } from './Modal';

const TYPE_LABEL: Record<NodeSuggestion['type'], string> = {
  quest: '📜 Quest',
  habit: '🔁 Gewohnheit',
  milestone: '🏆 Meilenstein',
};

interface SuggestionsModalProps {
  area: Area;
  onClose: () => void;
}

export function SuggestionsModal({ area, onClose }: SuggestionsModalProps) {
  const nodes = useAppStore((s) => s.nodes);
  const goals = useAppStore((s) => s.goals);
  const saveNode = useAppStore((s) => s.saveNode);

  const [suggestions, setSuggestions] = useState<NodeSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const areaNodes = nodes.filter((n) => n.areaId === area.id);
      try {
        const result = await fetchNodeSuggestions({
          areaName: area.name,
          areaDescription: area.description,
          level: levelFromXp(area.xp),
          completedNodes: areaNodes
            .filter((n) => n.status === 'completed')
            .map((n) => n.title),
          openNodes: areaNodes
            .filter((n) => n.status !== 'completed')
            .map((n) => n.title),
          goals: goals
            .filter((g) => g.areaId === area.id && g.status === 'open')
            .map((g) => g.title),
        });
        if (!cancelled) {
          setSuggestions(result);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // Loaded once when the modal opens – deliberately not reactive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  /** New nodes hang off the deepest completed node so the tree grows downward. */
  const anchorNodeId = (): string | undefined => {
    const areaNodes = nodes.filter((n) => n.areaId === area.id);
    const completed = areaNodes.filter((n) => n.status === 'completed');
    if (completed.length === 0) return undefined;
    const depths = nodeDepths(areaNodes);
    return completed.reduce((deepest, node) =>
      (depths.get(node.id) ?? 0) > (depths.get(deepest.id) ?? 0) ? node : deepest,
    ).id;
  };

  const addSelected = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const anchor = anchorNodeId();
    for (const index of selected) {
      const suggestion = suggestions[index];
      await saveNode({
        id: createId(),
        areaId: area.id,
        title: suggestion.title,
        description: suggestion.description,
        howTo: suggestion.howTo,
        prerequisites: anchor ? [anchor] : [],
        type: suggestion.type,
      });
    }
    onClose();
  };

  return (
    <Modal title="✨ KI-Vorschläge" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Passend zu deinem Fortschritt in {area.name}. Wähle aus, was du in
          deinen Baum übernehmen willst — ändern kannst du danach alles.
        </p>

        {loading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60"
              />
            ))}
            <p className="text-center text-xs text-slate-500">
              Die KI denkt über deinen nächsten Schritt nach …
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        )}

        {!loading &&
          !error &&
          suggestions.map((suggestion, index) => {
            const isSelected = selected.has(index);
            return (
              <button
                key={index}
                type="button"
                onClick={() => toggle(index)}
                className="w-full rounded-xl border p-3.5 text-left transition"
                style={{
                  borderColor: isSelected ? area.color : '#1e293b',
                  backgroundColor: isSelected ? `${area.color}14` : 'transparent',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {TYPE_LABEL[suggestion.type]}
                    </div>
                    <div className="mt-0.5 font-bold">{suggestion.title}</div>
                    <p className="mt-1 text-sm text-slate-400">
                      {suggestion.description}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-lg"
                    style={{ color: isSelected ? area.color : '#475569' }}
                  >
                    {isSelected ? '✓' : '＋'}
                  </span>
                </div>
              </button>
            );
          })}

        {!loading && !error && suggestions.length > 0 && (
          <button
            onClick={() => void addSelected()}
            disabled={selected.size === 0 || saving}
            className="w-full rounded-lg py-2.5 font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
            style={{ backgroundColor: area.color }}
          >
            {saving
              ? 'Wird hinzugefügt …'
              : selected.size === 0
                ? 'Wähle mindestens einen Vorschlag'
                : `${selected.size} in den Baum übernehmen`}
          </button>
        )}
      </div>
    </Modal>
  );
}
