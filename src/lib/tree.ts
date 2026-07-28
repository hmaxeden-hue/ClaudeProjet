import type { SkillNode } from '../types/models';

/**
 * Recompute locked/available for all non-completed nodes based on
 * their prerequisites. Completed nodes are never downgraded.
 */
export function recomputeNodeStatuses(nodes: SkillNode[]): SkillNode[] {
  const completed = new Set(
    nodes.filter((n) => n.status === 'completed').map((n) => n.id),
  );
  return nodes.map((node) => {
    if (node.status === 'completed') return node;
    const unlocked = node.prerequisites.every((id) => completed.has(id));
    const status = unlocked ? 'available' : 'locked';
    return node.status === status ? node : { ...node, status };
  });
}

/**
 * Depth of a node = longest prerequisite chain above it.
 * Used for the tree layout and to pick the "next recommended step".
 */
export function nodeDepths(nodes: SkillNode[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depths = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (id: string): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    // Guard against cycles introduced by manual editing.
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const node = byId.get(id);
    const prereqs = node?.prerequisites.filter((p) => byId.has(p)) ?? [];
    const depth =
      prereqs.length === 0 ? 0 : Math.max(...prereqs.map(depthOf)) + 1;
    visiting.delete(id);
    depths.set(id, depth);
    return depth;
  };

  nodes.forEach((n) => depthOf(n.id));
  return depths;
}

/** The shallowest available node of an area – shown as the recommended next step. */
export function nextStepForArea(
  nodes: SkillNode[],
  areaId: string,
): SkillNode | null {
  const areaNodes = nodes.filter((n) => n.areaId === areaId);
  const depths = nodeDepths(areaNodes);
  const available = areaNodes.filter((n) => n.status === 'available');
  if (available.length === 0) return null;
  available.sort(
    (a, b) => (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0),
  );
  return available[0];
}
