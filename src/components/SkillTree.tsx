import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import type { Area, AreaTrack, SkillNode } from '../types/models';
import { nodeDepths, trackIdOf, tracksOf } from '../lib/tree';

const NODE_TYPE_LABEL: Record<SkillNode['type'], string> = {
  milestone: 'Meilenstein',
  quest: 'Quest',
  habit: 'Gewohnheit',
};

const NODE_TYPE_ICON: Record<SkillNode['type'], string> = {
  milestone: '🏆',
  quest: '📜',
  habit: '🔁',
};

/** Side tracks are drawn in a muted tone so the main path stands out. */
const SIDE_COLOR = '#64748b';

type SkillNodeData = {
  skill: SkillNode;
  color: string;
  isMain: boolean;
  onSelect: (nodeId: string) => void;
};

type TrackLabelData = { track: AreaTrack; color: string; count: number };

type SkillFlowNode = Node<SkillNodeData, 'skill'>;
type TrackFlowNode = Node<TrackLabelData, 'track'>;
type AnyFlowNode = SkillFlowNode | TrackFlowNode;

function SkillNodeCard({ data }: NodeProps<SkillFlowNode>) {
  const { skill, color, isMain, onSelect } = data;
  const isCompleted = skill.status === 'completed';
  const isAvailable = skill.status === 'available';
  const accent = isMain ? color : SIDE_COLOR;

  return (
    <button
      onClick={() => onSelect(skill.id)}
      className={`rounded-xl px-4 py-3 text-left transition hover:scale-[1.03] ${
        isMain ? 'w-56 border-2' : 'w-48 border'
      }`}
      style={{
        backgroundColor: isCompleted
          ? `${accent}22`
          : isAvailable
            ? 'rgba(15, 23, 42, 0.95)'
            : 'rgba(15, 23, 42, 0.6)',
        borderColor: isCompleted
          ? accent
          : isAvailable
            ? `${accent}aa`
            : '#334155',
        boxShadow: isAvailable
          ? `0 0 ${isMain ? 22 : 12}px ${accent}55`
          : isCompleted
            ? `0 0 10px ${accent}33`
            : 'none',
        opacity: skill.status === 'locked' ? 0.55 : 1,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-slate-600"
      />
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <span>
          {skill.status === 'locked' ? '🔒' : NODE_TYPE_ICON[skill.type]}
        </span>
        <span>{NODE_TYPE_LABEL[skill.type]}</span>
        {isCompleted && <span style={{ color: accent }}>✓ erledigt</span>}
      </div>
      <div
        className={`mt-1 font-bold leading-snug ${isMain ? 'text-sm' : 'text-xs'}`}
        style={{ color: isCompleted ? accent : '#f1f5f9' }}
      >
        {skill.title}
      </div>
      <div className="mt-1 text-xs font-semibold text-slate-400">
        +{skill.xpReward} XP
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-slate-600"
      />
    </button>
  );
}

/** Headline above each column, so the main path is unmistakable. */
function TrackLabel({ data }: NodeProps<TrackFlowNode>) {
  const { track, color } = data;
  return (
    <div className="w-56 text-center">
      <div
        className="inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
        style={{
          color: track.isMain ? color : SIDE_COLOR,
          backgroundColor: track.isMain ? `${color}1a` : 'rgba(100,116,139,0.12)',
          border: `1px solid ${track.isMain ? `${color}66` : 'rgba(100,116,139,0.4)'}`,
        }}
      >
        {track.isMain ? '★ Hauptziel' : 'Nebenziel'}
      </div>
      <div
        className={`mt-1.5 leading-snug ${
          track.isMain ? 'text-sm font-bold text-slate-100' : 'text-xs text-slate-400'
        }`}
      >
        {track.title}
      </div>
    </div>
  );
}

const nodeTypes = { skill: SkillNodeCard, track: TrackLabel };

interface SkillTreeProps {
  area: Area;
  nodes: SkillNode[];
  onSelectNode: (nodeId: string) => void;
}

const H_GAP = 250;
const V_GAP = 185;
/** Space between two track columns – wide enough to read as separate paths. */
const TRACK_GAP = 130;

/**
 * One column block per track, main track first, rows by prerequisite depth.
 *
 * Depth is computed across the whole area rather than per track, so a side
 * node that builds on a main-track node is drawn below it and the connecting
 * edge still points downwards.
 */
function layoutNodes(
  area: Area,
  skills: SkillNode[],
  onSelect: (id: string) => void,
): { flowNodes: AnyFlowNode[]; flowEdges: Edge[] } {
  const depths = nodeDepths(skills);
  const color = area.color;
  const flowNodes: AnyFlowNode[] = [];

  // Tracks that actually have nodes, main one first.
  const tracks = tracksOf(area).filter((track) =>
    skills.some((s) => trackIdOf(s) === track.id),
  );
  // Nodes pointing at a track that no longer exists still have to be drawn.
  const known = new Set(tracks.map((t) => t.id));
  const orphans = skills.filter((s) => !known.has(trackIdOf(s)));

  let cursorX = 0;
  const blocks: { track: AreaTrack; nodes: SkillNode[] }[] = tracks.map(
    (track) => ({
      track,
      nodes: skills.filter(
        (s) => trackIdOf(s) === track.id || (track.isMain && orphans.includes(s)),
      ),
    }),
  );

  for (const { track, nodes } of blocks) {
    const rows = new Map<number, SkillNode[]>();
    for (const skill of nodes) {
      const depth = depths.get(skill.id) ?? 0;
      rows.set(depth, [...(rows.get(depth) ?? []), skill]);
    }
    const widest = Math.max(...[...rows.values()].map((r) => r.length), 1);
    const blockWidth = widest * H_GAP;
    const centerX = cursorX + blockWidth / 2;

    if (blocks.length > 1) {
      flowNodes.push({
        id: `track-${track.id}`,
        type: 'track',
        position: { x: centerX - 112, y: -110 },
        data: { track, color, count: nodes.length },
        draggable: false,
        selectable: false,
      });
    }

    for (const [depth, row] of rows) {
      row.forEach((skill, index) => {
        flowNodes.push({
          id: skill.id,
          type: 'skill',
          position: {
            x: centerX + (index - (row.length - 1) / 2) * H_GAP,
            y: depth * V_GAP,
          },
          data: { skill, color, isMain: track.isMain, onSelect },
          draggable: false,
          // React Flow turns off pointer events for nodes it considers
          // non-interactive – without this the cards cannot be clicked.
          selectable: true,
        });
      });
    }

    cursorX += blockWidth + TRACK_GAP;
  }

  const ids = new Set(skills.map((s) => s.id));
  const mainTrackId = tracks.find((t) => t.isMain)?.id;
  const flowEdges: Edge[] = skills.flatMap((skill) =>
    skill.prerequisites
      .filter((p) => ids.has(p))
      .map((prereq) => {
        const onMain = trackIdOf(skill) === mainTrackId;
        const stroke =
          skill.status === 'locked' ? '#334155' : onMain ? color : SIDE_COLOR;
        return {
          id: `${prereq}->${skill.id}`,
          source: prereq,
          target: skill.id,
          animated: skill.status === 'available',
          style: {
            stroke,
            strokeWidth: onMain ? 2.5 : 1.5,
            // Cross-track links are dashed: they are hints, not the main path.
            strokeDasharray:
              trackIdOf(skill) === trackIdOf(
                skills.find((s) => s.id === prereq)!,
              )
                ? undefined
                : '6 4',
            opacity: skill.status === 'locked' ? 0.5 : 0.9,
          },
        };
      }),
  );

  return { flowNodes, flowEdges };
}

export function SkillTree({ area, nodes, onSelectNode }: SkillTreeProps) {
  const { flowNodes, flowEdges } = useMemo(
    () => layoutNodes(area, nodes, onSelectNode),
    [area, nodes, onSelectNode],
  );

  const instance = useRef<ReactFlowInstance<AnyFlowNode, Edge> | null>(null);

  /**
   * The `fitView` prop runs before the custom cards have been measured, so with
   * several tracks the lowest row ends up cut off. Fitting again on the next
   * frame uses the real sizes.
   */
  const refit = useCallback(() => {
    requestAnimationFrame(() =>
      instance.current?.fitView({ padding: 0.2, maxZoom: 1 }),
    );
  }, []);

  useEffect(refit, [refit, flowNodes]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-700 text-slate-500">
        Noch keine Skills – lege den ersten Knoten an!
      </div>
    );
  }

  return (
    <div className="h-[560px] rounded-2xl border border-slate-800 bg-slate-950/60">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onInit={(rf) => {
          instance.current = rf;
          refit();
        }}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.6}
        proOptions={{ hideAttribution: false }}
        nodesConnectable={false}
      >
        <Background color="#1e293b" gap={24} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
