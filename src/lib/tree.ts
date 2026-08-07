import type { Area, AreaTrack, SkillNode } from '../types/models';

/** Id of the track a node belongs to; nodes without one sit on the main track. */
export const MAIN_TRACK_ID = 'main';

export function trackIdOf(node: SkillNode): string {
  return node.trackId ?? MAIN_TRACK_ID;
}

/**
 * The area's tracks, main one first, with a fallback for areas created before
 * tracks existed – their whole tree is simply the main track.
 */
export function tracksOf(area: Area): AreaTrack[] {
  const tracks = area.tracks ?? [];
  if (tracks.length === 0) {
    return [{ id: MAIN_TRACK_ID, title: area.name, isMain: true }];
  }
  return [...tracks].sort(
    (a, b) => Number(b.isMain) - Number(a.isMain) || a.title.localeCompare(b.title),
  );
}

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

/**
 * The recommended next step of an area: the shallowest available node, with
 * the main track winning ties. The point of a main track is that it is the one
 * the app keeps pointing at.
 */
export function nextStepForArea(
  nodes: SkillNode[],
  areaId: string,
): SkillNode | null {
  const areaNodes = nodes.filter((n) => n.areaId === areaId);
  const depths = nodeDepths(areaNodes);
  const available = areaNodes.filter((n) => n.status === 'available');
  if (available.length === 0) return null;
  available.sort(
    (a, b) =>
      Number(trackIdOf(b) === MAIN_TRACK_ID) -
        Number(trackIdOf(a) === MAIN_TRACK_ID) ||
      (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0),
  );
  return available[0];
}

/** Every open next step of an area, grouped by track – main track first. */
export function nextStepsByTrack(
  area: Area,
  nodes: SkillNode[],
): { track: AreaTrack; node: SkillNode }[] {
  const areaNodes = nodes.filter((n) => n.areaId === area.id);
  const depths = nodeDepths(areaNodes);

  return tracksOf(area)
    .map((track) => {
      const open = areaNodes
        .filter((n) => trackIdOf(n) === track.id && n.status === 'available')
        .sort((a, b) => (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0));
      return open[0] ? { track, node: open[0] } : null;
    })
    .filter((entry): entry is { track: AreaTrack; node: SkillNode } =>
      Boolean(entry),
    );
}
