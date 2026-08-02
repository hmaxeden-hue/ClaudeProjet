import type { NodeType } from '../types/models';

/**
 * Leveling math. Levels start at 1 and there is no cap.
 * xpForLevel(n) is the XP needed to advance from level n to n + 1.
 */

export function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.5));
}

/** Total XP required to have reached the given level (from level 1). */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpForLevel(l);
  return total;
}

/** Derive the current level from accumulated XP. */
export function levelFromXp(xp: number): number {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return level;
}

/** Progress within the current level, for rendering XP bars. */
export function levelProgress(xp: number): {
  level: number;
  current: number;
  needed: number;
  ratio: number;
} {
  const level = levelFromXp(xp);
  const current = xp - totalXpForLevel(level);
  const needed = xpForLevel(level);
  return { level, current, needed, ratio: Math.min(current / needed, 1) };
}

// --- earning rules ---------------------------------------------------------
//
// One principle throughout: the user describes *what* they did, the system
// decides what it is worth. Nowhere in the app can a number be typed in — that
// keeps levels comparable between areas, over time, and between people.


/** How much of an activity was done. The user classifies; we price. */
export type ActivityScope = 'small' | 'normal' | 'large';

export const SCOPE_MULTIPLIER: Record<ActivityScope, number> = {
  small: 0.5,
  normal: 1,
  large: 2,
};

export const SCOPE_META: Record<
  ActivityScope,
  { label: string; hint: string }
> = {
  small: { label: 'Kurz', hint: 'bis ~15 Min' },
  normal: { label: 'Normal', hint: '~15–45 Min' },
  large: { label: 'Ausgiebig', hint: 'über ~45 Min' },
};

export const ACTIVITY_SCOPES: ActivityScope[] = ['small', 'normal', 'large'];

export function xpForActivity(baseXp: number, scope: ActivityScope): number {
  return Math.max(5, Math.round(baseXp * SCOPE_MULTIPLIER[scope]));
}

/**
 * A node's reward follows its kind and how deep it sits in the tree — deeper
 * means more prerequisites had to be cleared first, so it is worth more.
 */
const NODE_BASE_XP: Record<NodeType, number> = {
  quest: 50,
  habit: 75,
  milestone: 125,
};

/** Depth is capped so a very long chain cannot inflate rewards without end. */
export const MAX_REWARDED_DEPTH = 6;

export function xpForNode(type: NodeType, depth: number): number {
  const bounded = Math.min(Math.max(depth, 0), MAX_REWARDED_DEPTH);
  return NODE_BASE_XP[type] + bounded * 25;
}

/** Goals are priced by how much work they represent, not by a free number. */
export type GoalSize = 'small' | 'medium' | 'large';

export const GOAL_XP: Record<GoalSize, number> = {
  small: 100,
  medium: 250,
  large: 500,
};

export const GOAL_SIZE_META: Record<
  GoalSize,
  { label: string; hint: string }
> = {
  small: { label: 'Klein', hint: 'in Tagen zu schaffen' },
  medium: { label: 'Mittel', hint: 'einige Wochen' },
  large: { label: 'Groß', hint: 'Monate oder länger' },
};

export const GOAL_SIZES: GoalSize[] = ['small', 'medium', 'large'];

/** Fallback catalog for areas that bring no activities of their own. */
export const GENERIC_ACTIVITIES = [
  { label: 'Geübt oder trainiert', xp: 25 },
  { label: 'Etwas dazugelernt', xp: 20 },
  { label: 'Im Alltag angewandt', xp: 30 },
  { label: 'Reflektiert oder geplant', xp: 15 },
];
