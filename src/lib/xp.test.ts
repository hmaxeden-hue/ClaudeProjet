import { describe, expect, it } from 'vitest';
import {
  GOAL_XP,
  MAX_REWARDED_DEPTH,
  levelFromXp,
  levelProgress,
  xpForActivity,
  xpForLevel,
  xpForNode,
} from './xp';

describe('level curve', () => {
  it('starts at level 1 and rises with a growing threshold', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(xpForLevel(1)).toBeLessThan(xpForLevel(2));
    expect(xpForLevel(2)).toBeLessThan(xpForLevel(3));
  });

  it('levels up exactly at the threshold, not before', () => {
    const needed = xpForLevel(1);
    expect(levelFromXp(needed - 1)).toBe(1);
    expect(levelFromXp(needed)).toBe(2);
  });

  it('reports progress within the current level', () => {
    const { level, current, needed, ratio } = levelProgress(xpForLevel(1) + 10);
    expect(level).toBe(2);
    expect(current).toBe(10);
    expect(needed).toBe(xpForLevel(2));
    expect(ratio).toBeCloseTo(10 / xpForLevel(2));
  });
});

describe('activity pricing', () => {
  it('scales the catalog value by the chosen scope', () => {
    expect(xpForActivity(20, 'small')).toBe(10);
    expect(xpForActivity(20, 'normal')).toBe(20);
    expect(xpForActivity(20, 'large')).toBe(40);
  });

  it('never awards less than a token amount', () => {
    expect(xpForActivity(1, 'small')).toBe(5);
  });
});

describe('node pricing', () => {
  it('rewards harder kinds more', () => {
    expect(xpForNode('quest', 0)).toBeLessThan(xpForNode('habit', 0));
    expect(xpForNode('habit', 0)).toBeLessThan(xpForNode('milestone', 0));
  });

  it('rewards depth, because more prerequisites had to be cleared', () => {
    expect(xpForNode('quest', 2)).toBeGreaterThan(xpForNode('quest', 0));
  });

  it('caps depth so a long chain cannot inflate rewards without end', () => {
    expect(xpForNode('quest', MAX_REWARDED_DEPTH + 10)).toBe(
      xpForNode('quest', MAX_REWARDED_DEPTH),
    );
  });

  it('treats a negative depth as the root', () => {
    expect(xpForNode('quest', -3)).toBe(xpForNode('quest', 0));
  });
});

describe('goal pricing', () => {
  it('grows with the effort class', () => {
    expect(GOAL_XP.small).toBeLessThan(GOAL_XP.medium);
    expect(GOAL_XP.medium).toBeLessThan(GOAL_XP.large);
  });
});
