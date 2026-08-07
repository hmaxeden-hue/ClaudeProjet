import type { Area, SkillNode } from '../types/models';
import { useAppStore } from '../store/useAppStore';
import { trackIdOf, tracksOf } from '../lib/tree';
import { dailyQuestBonus, dayKey } from '../lib/dailyQuest';
import { HowToList } from './HowToList';
import { Modal } from './Modal';

const STATUS_LABEL: Record<SkillNode['status'], string> = {
  locked: '🔒 Gesperrt',
  available: '✨ Verfügbar',
  completed: '✓ Abgeschlossen',
};

interface NodeDetailModalProps {
  node: SkillNode;
  area: Area;
  onEdit: () => void;
  onClose: () => void;
}

export function NodeDetailModal({
  node,
  area,
  onEdit,
  onClose,
}: NodeDetailModalProps) {
  const nodes = useAppStore((s) => s.nodes);
  const completeNode = useAppStore((s) => s.completeNode);
  const deleteNode = useAppStore((s) => s.deleteNode);
  const quest = useAppStore((s) => s.profile?.dailyQuest);

  const prereqNodes = node.prerequisites
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is SkillNode => Boolean(n));

  const openPrereqs = prereqNodes.filter((p) => p.status !== 'completed');
  const track = tracksOf(area).find((t) => t.id === trackIdOf(node));
  const isTodaysQuest =
    quest?.nodeId === node.id && quest.day === dayKey() && !quest.completed;
  const bonus = isTodaysQuest ? dailyQuestBonus(node.xpReward) : 0;

  const handleComplete = async () => {
    await completeNode(node.id);
    onClose();
  };

  const handleDelete = async () => {
    if (
      window.confirm(
        `Skill "${node.title}" wirklich löschen? Andere Skills verlieren diese Voraussetzung.`,
      )
    ) {
      await deleteNode(node.id);
      onClose();
    }
  };

  return (
    <Modal title={node.title} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className="rounded-full px-3 py-1 font-semibold"
            style={{
              backgroundColor: `${area.color}1a`,
              color: area.color,
            }}
          >
            {STATUS_LABEL[node.status]}
          </span>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">
            +{node.xpReward} XP
          </span>
          {track && (
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                backgroundColor: track.isMain ? `${area.color}1a` : '#1e293b',
                color: track.isMain ? area.color : '#94a3b8',
              }}
            >
              {track.isMain ? '★ Hauptweg' : 'Nebenweg'}: {track.title}
            </span>
          )}
          {isTodaysQuest && (
            <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300">
              ⚡ Tagesquest · +{bonus} XP Bonus
            </span>
          )}
        </div>

        {node.description && (
          <p className="text-sm text-slate-300">{node.description}</p>
        )}

        {node.howTo && node.howTo.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              So gehst du vor
            </h3>
            <HowToList steps={node.howTo} color={area.color} />
          </div>
        )}

        {prereqNodes.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Voraussetzungen
            </h3>
            <ul className="mt-1.5 space-y-1 text-sm">
              {prereqNodes.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span>{p.status === 'completed' ? '✅' : '⬜'}</span>
                  <span
                    className={
                      p.status === 'completed'
                        ? 'text-slate-400 line-through'
                        : 'text-slate-300'
                    }
                  >
                    {p.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {node.completedAt && (
          <p className="text-xs text-slate-500">
            Abgeschlossen am{' '}
            {new Date(node.completedAt).toLocaleDateString('de-DE')}
          </p>
        )}

        {/* Locked nodes can be ticked off too – you may well have done this
            one already, in your own order. */}
        {node.status === 'locked' && (
          <p className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
            {openPrereqs.length === 1
              ? `Normalerweise kommt „${openPrereqs[0].title}" vorher – wenn du das hier trotzdem geschafft hast, hak es ab.`
              : `Normalerweise kommen ${openPrereqs.length} andere Skills vorher – wenn du das hier trotzdem geschafft hast, hak es ab.`}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          {node.status !== 'completed' && (
            <button
              onClick={() => void handleComplete()}
              className="flex-1 rounded-lg py-2.5 font-bold text-slate-950 transition hover:brightness-110"
              style={{ backgroundColor: area.color }}
            >
              ✓ {node.status === 'locked' ? 'Trotzdem erledigt' : 'Abschließen'}{' '}
              (+{node.xpReward + bonus} XP)
            </button>
          )}
          <button
            onClick={onEdit}
            className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Bearbeiten
          </button>
          <button
            onClick={() => void handleDelete()}
            className="rounded-lg border border-rose-900/60 px-4 py-2.5 text-sm text-rose-400 transition hover:border-rose-500"
          >
            Löschen
          </button>
        </div>
      </div>
    </Modal>
  );
}
