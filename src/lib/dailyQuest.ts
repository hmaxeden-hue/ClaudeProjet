import type { DailyQuestState, SkillNode } from '../types/models';

/**
 * The daily quest: one open skill singled out each day, worth bonus XP when it
 * is finished on that same day.
 *
 * The pick is stored on the profile rather than recomputed. Recomputing looks
 * tempting (no state to keep) but the candidate set shrinks the moment a node
 * is completed, so the quest would silently jump to a different node — and the
 * bonus could be collected again and again on the same day.
 */

/** Local calendar day, the unit the streak and the quest both work in. */
export function dayKey(date: Date = new Date()): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Small deterministic string hash, so the same day picks the same node. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Extra reward on top of the node's own, for doing it on the quest's day. */
export function dailyQuestBonus(xpReward: number): number {
  return Math.round(xpReward * 0.5);
}

/** Picks a quest for `day` from the nodes that are doable right now. */
export function pickDailyQuest(
  nodes: SkillNode[],
  day: string,
): SkillNode | null {
  const candidates = nodes
    .filter((n) => n.status === 'available')
    .sort((a, b) => a.id.localeCompare(b.id));
  if (candidates.length === 0) return null;
  return candidates[hash(day) % candidates.length];
}

/**
 * The quest state for `day`, reusing the stored one while it is still valid.
 *
 * Returns null when there is nothing to do at all; returns the previous state
 * unchanged when it still applies, so callers can skip a pointless write.
 */
export function resolveDailyQuest(
  stored: DailyQuestState | undefined,
  nodes: SkillNode[],
  day: string,
): DailyQuestState | null {
  if (stored?.day === day) {
    const node = nodes.find((n) => n.id === stored.nodeId);
    // A finished quest stays put for the rest of the day; an unfinished one is
    // only kept while its node still exists and is still doable.
    if (stored.completed) return stored;
    if (node && node.status === 'available') return stored;
  }

  const picked = pickDailyQuest(nodes, day);
  return picked ? { day, nodeId: picked.id, completed: false } : null;
}
