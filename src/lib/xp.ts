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
