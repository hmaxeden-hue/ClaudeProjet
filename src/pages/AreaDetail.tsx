import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { levelFromXp } from '../lib/xp';
import { nextStepsByTrack } from '../lib/tree';
import { XPBar } from '../components/XPBar';
import { SkillTree } from '../components/SkillTree';
import { NodeDetailModal } from '../components/NodeDetailModal';
import { NodeFormModal } from '../components/NodeFormModal';
import { AreaFormModal } from '../components/AreaFormModal';
import { ActivityFormModal } from '../components/ActivityFormModal';
import { GoalsTab } from '../components/GoalsTab';
import { ResourcesTab } from '../components/ResourcesTab';
import { LogTab } from '../components/LogTab';
import { HowToList } from '../components/HowToList';
import { SuggestionsModal } from '../components/SuggestionsModal';
import { useAuthStore } from '../store/useAuthStore';
import type { SkillNode } from '../types/models';

type Tab = 'tree' | 'goals' | 'resources' | 'log';

const TABS: { id: Tab; label: string }[] = [
  { id: 'tree', label: '🌳 Skill-Tree' },
  { id: 'goals', label: '🎯 Ziele' },
  { id: 'resources', label: '📚 Ressourcen' },
  { id: 'log', label: '📝 Log' },
];

export function AreaDetail() {
  const { areaId } = useParams<{ areaId: string }>();
  const navigate = useNavigate();

  const areas = useAppStore((s) => s.areas);
  const nodes = useAppStore((s) => s.nodes);
  const deleteArea = useAppStore((s) => s.deleteArea);
  const completeNode = useAppStore((s) => s.completeNode);

  const [tab, setTab] = useState<Tab>('tree');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<SkillNode | null>(null);
  const [showNodeForm, setShowNodeForm] = useState(false);
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const isSignedIn = useAuthStore((s) => s.status) === 'signed_in';

  const area = areas.find((a) => a.id === areaId);
  const areaNodes = useMemo(
    () => nodes.filter((n) => n.areaId === areaId),
    [nodes, areaId],
  );

  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  if (!area) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p>Bereich nicht gefunden.</p>
        <Link to="/" className="mt-3 inline-block text-sky-400 hover:underline">
          Zurück zum Dashboard
        </Link>
      </div>
    );
  }

  const level = levelFromXp(area.xp);
  const nextSteps = nextStepsByTrack(area, nodes);
  const selectedNode = areaNodes.find((n) => n.id === selectedNodeId) ?? null;

  const handleDeleteArea = async () => {
    if (
      window.confirm(
        `Bereich "${area.name}" inklusive aller Skills, Ziele, Ressourcen und Logs löschen? Das kann nicht rückgängig gemacht werden.`,
      )
    ) {
      await deleteArea(area.id);
      navigate('/');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl"
            style={{ backgroundColor: `${area.color}1a` }}
          >
            {area.icon}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <Link to="/" className="text-sm text-slate-500 hover:text-white">
                ←
              </Link>
              <h1 className="text-2xl font-extrabold tracking-tight">
                {area.name}
              </h1>
              <span
                className="rounded-full px-3 py-0.5 text-sm font-bold"
                style={{ backgroundColor: `${area.color}1a`, color: area.color }}
              >
                Level {level}
              </span>
            </div>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              {area.description}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowActivityForm(true)}
            className="rounded-xl px-4 py-2.5 font-bold text-slate-950 transition hover:brightness-110"
            style={{ backgroundColor: area.color }}
          >
            + Aktivität
          </button>
          <button
            onClick={() => setShowAreaForm(true)}
            className="rounded-xl border border-slate-700 px-3 py-2.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            aria-label="Bereich bearbeiten"
          >
            ✎
          </button>
          {area.isCustom && (
            <button
              onClick={() => void handleDeleteArea()}
              className="rounded-xl border border-rose-900/60 px-3 py-2.5 text-sm text-rose-400 transition hover:border-rose-500"
              aria-label="Bereich löschen"
            >
              🗑
            </button>
          )}
        </div>
      </div>

      <XPBar xp={area.xp} color={area.color} />

      {/* The next step, spelled out: what to do and how to do it. */}
      {nextSteps.map(({ track, node }) => (
        <div
          key={track.id}
          className="rounded-xl border px-4 py-3.5"
          style={{
            borderColor: track.isMain ? `${area.color}55` : '#1e293b',
            backgroundColor: track.isMain ? `${area.color}0d` : 'transparent',
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                {track.isMain
                  ? `★ Nächster Schritt zu: ${track.title}`
                  : `Nebenweg: ${track.title}`}
              </div>
              <button
                onClick={() => setSelectedNodeId(node.id)}
                className="mt-0.5 text-left text-lg font-bold hover:underline"
                style={{ color: track.isMain ? area.color : '#cbd5e1' }}
              >
                {node.title}
              </button>
              {node.description && (
                <p className="mt-1 max-w-2xl text-sm text-slate-400">
                  {node.description}
                </p>
              )}
            </div>
            <button
              onClick={() => void completeNode(node.id)}
              className="shrink-0 rounded-lg px-4 py-2 text-sm font-bold text-slate-950 transition hover:brightness-110"
              style={{ backgroundColor: track.isMain ? area.color : '#64748b' }}
            >
              ✓ Erledigt (+{node.xpReward} XP)
            </button>
          </div>
          {node.howTo && node.howTo.length > 0 && (
            <div className="mt-3 border-t border-slate-800/80 pt-3">
              <HowToList steps={node.howTo} color={area.color} />
            </div>
          )}
        </div>
      ))}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t.id
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tree' && (
        <div className="space-y-3">
          <div className="flex justify-end gap-2">
            {isSignedIn && (
              <button
                onClick={() => setShowSuggestions(true)}
                className="rounded-lg border px-3 py-1.5 text-sm transition hover:brightness-125"
                style={{
                  borderColor: `${area.color}55`,
                  backgroundColor: `${area.color}12`,
                  color: area.color,
                }}
              >
                ✨ KI-Vorschläge
              </button>
            )}
            <button
              onClick={() => {
                setEditingNode(null);
                setShowNodeForm(true);
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              + Neuer Skill
            </button>
          </div>
          <SkillTree
            area={area}
            nodes={areaNodes}
            onSelectNode={handleSelectNode}
          />
          <p className="text-center text-xs text-slate-600">
            Knoten anklicken für Details · Ziehen zum Verschieben der Ansicht ·
            Scrollen zum Zoomen
          </p>
        </div>
      )}
      {tab === 'goals' && <GoalsTab area={area} />}
      {tab === 'resources' && <ResourcesTab area={area} />}
      {tab === 'log' && <LogTab area={area} />}

      {/* Modals */}
      {selectedNode && !showNodeForm && (
        <NodeDetailModal
          node={selectedNode}
          area={area}
          onEdit={() => {
            setEditingNode(selectedNode);
            setShowNodeForm(true);
          }}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
      {showNodeForm && (
        <NodeFormModal
          areaId={area.id}
          node={editingNode}
          onClose={() => {
            setShowNodeForm(false);
            setEditingNode(null);
            setSelectedNodeId(null);
          }}
        />
      )}
      {showAreaForm && (
        <AreaFormModal area={area} onClose={() => setShowAreaForm(false)} />
      )}
      {showActivityForm && (
        <ActivityFormModal
          initialAreaId={area.id}
          onClose={() => setShowActivityForm(false)}
        />
      )}
      {showSuggestions && (
        <SuggestionsModal
          area={area}
          onClose={() => setShowSuggestions(false)}
        />
      )}
    </div>
  );
}
