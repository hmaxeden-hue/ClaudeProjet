import { useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import type { SkillNode } from '../types/models';
import { nodeDepths } from '../lib/tree';

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

type SkillNodeData = {
  skill: SkillNode;
  color: string;
  onSelect: (nodeId: string) => void;
};

type SkillFlowNode = Node<SkillNodeData, 'skill'>;

function SkillNodeCard({ data }: NodeProps<SkillFlowNode>) {
  const { skill, color, onSelect } = data;
  const isCompleted = skill.status === 'completed';
  const isAvailable = skill.status === 'available';

  return (
    <button
      onClick={() => onSelect(skill.id)}
      className="w-52 rounded-xl border-2 px-4 py-3 text-left transition hover:scale-[1.03]"
      style={{
        backgroundColor: isCompleted
          ? `${color}22`
          : isAvailable
            ? 'rgba(15, 23, 42, 0.95)'
            : 'rgba(15, 23, 42, 0.6)',
        borderColor: isCompleted ? color : isAvailable ? `${color}aa` : '#334155',
        boxShadow: isAvailable
          ? `0 0 18px ${color}55`
          : isCompleted
            ? `0 0 10px ${color}33`
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
        {isCompleted && <span style={{ color }}>✓ erledigt</span>}
      </div>
      <div
        className="mt-1 text-sm font-bold leading-snug"
        style={{ color: isCompleted ? color : '#f1f5f9' }}
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

const nodeTypes = { skill: SkillNodeCard };

interface SkillTreeProps {
  nodes: SkillNode[];
  color: string;
  onSelectNode: (nodeId: string) => void;
}

/**
 * Layered tree layout: nodes are placed in rows by prerequisite depth,
 * centered horizontally within each row.
 */
function layoutNodes(
  skills: SkillNode[],
  color: string,
  onSelect: (id: string) => void,
): { flowNodes: SkillFlowNode[]; flowEdges: Edge[] } {
  const depths = nodeDepths(skills);
  const rows = new Map<number, SkillNode[]>();
  for (const skill of skills) {
    const depth = depths.get(skill.id) ?? 0;
    const row = rows.get(depth) ?? [];
    row.push(skill);
    rows.set(depth, row);
  }

  const H_GAP = 250;
  const V_GAP = 170;

  const flowNodes: SkillFlowNode[] = [];
  for (const [depth, row] of rows) {
    row.forEach((skill, index) => {
      flowNodes.push({
        id: skill.id,
        type: 'skill',
        position: {
          x: (index - (row.length - 1) / 2) * H_GAP,
          y: depth * V_GAP,
        },
        data: { skill, color, onSelect },
        draggable: false,
      });
    });
  }

  const ids = new Set(skills.map((s) => s.id));
  const flowEdges: Edge[] = skills.flatMap((skill) =>
    skill.prerequisites
      .filter((p) => ids.has(p))
      .map((prereq) => ({
        id: `${prereq}->${skill.id}`,
        source: prereq,
        target: skill.id,
        animated: skill.status === 'available',
        style: {
          stroke: skill.status === 'locked' ? '#334155' : color,
          strokeWidth: 2,
          opacity: skill.status === 'locked' ? 0.5 : 0.9,
        },
      })),
  );

  return { flowNodes, flowEdges };
}

export function SkillTree({ nodes, color, onSelectNode }: SkillTreeProps) {
  const { flowNodes, flowEdges } = useMemo(
    () => layoutNodes(nodes, color, onSelectNode),
    [nodes, color, onSelectNode],
  );

  if (nodes.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-700 text-slate-500">
        Noch keine Skills – lege den ersten Knoten an!
      </div>
    );
  }

  return (
    <div className="h-[520px] rounded-2xl border border-slate-800 bg-slate-950/60">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.6}
        proOptions={{ hideAttribution: false }}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="#1e293b" gap={24} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
