import { describe, expect, it } from 'vitest';
import {
  dailyQuestBonus,
  dayKey,
  pickDailyQuest,
  resolveDailyQuest,
} from './dailyQuest';
import type { SkillNode } from '../types/models';

const node = (id: string, over: Partial<SkillNode> = {}): SkillNode => ({
  id,
  areaId: 'area-1',
  title: `Skill ${id}`,
  description: '',
  prerequisites: [],
  xpReward: 100,
  status: 'available',
  type: 'quest',
  ...over,
});

const open = [node('a'), node('b'), node('c'), node('d')];

describe('pickDailyQuest', () => {
  it('picks the same node all day and a different one over time', () => {
    expect(pickDailyQuest(open, '2026-08-07')?.id).toBe(
      pickDailyQuest(open, '2026-08-07')?.id,
    );

    const week = ['2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10'].map(
      (day) => pickDailyQuest(open, day)?.id,
    );
    expect(new Set(week).size).toBeGreaterThan(1);
  });

  it('never picks a locked or completed node', () => {
    const nodes = [
      node('a', { status: 'locked' }),
      node('b', { status: 'completed' }),
      node('c'),
    ];
    for (const day of ['2026-08-07', '2026-08-08', '2026-08-09']) {
      expect(pickDailyQuest(nodes, day)?.id).toBe('c');
    }
  });

  it('returns null when there is nothing to do', () => {
    expect(pickDailyQuest([], '2026-08-07')).toBeNull();
    expect(
      pickDailyQuest([node('a', { status: 'locked' })], '2026-08-07'),
    ).toBeNull();
  });
});

describe('resolveDailyQuest', () => {
  const today = '2026-08-07';

  it('keeps a finished quest for the rest of the day', () => {
    const stored = { day: today, nodeId: 'a', completed: true };
    // 'a' is done now, so a fresh pick would land elsewhere – it must not.
    const nodes = [node('a', { status: 'completed' }), node('b'), node('c')];

    expect(resolveDailyQuest(stored, nodes, today)).toBe(stored);
  });

  it('keeps an unfinished quest while its node is still doable', () => {
    const stored = { day: today, nodeId: 'c', completed: false };
    expect(resolveDailyQuest(stored, open, today)).toBe(stored);
  });

  it('re-picks when the day rolled over', () => {
    const stored = { day: '2026-08-06', nodeId: 'a', completed: true };
    const next = resolveDailyQuest(stored, open, today);

    expect(next?.day).toBe(today);
    expect(next?.completed).toBe(false);
  });

  it('re-picks when the stored node was deleted or locked again', () => {
    const stored = { day: today, nodeId: 'weg', completed: false };
    const next = resolveDailyQuest(stored, open, today);

    expect(next?.nodeId).not.toBe('weg');
    expect(open.some((n) => n.id === next?.nodeId)).toBe(true);
  });

  it('yields null when the area has nothing available', () => {
    expect(resolveDailyQuest(undefined, [], today)).toBeNull();
  });
});

describe('dailyQuestBonus', () => {
  it('adds half the node reward on top', () => {
    expect(dailyQuestBonus(100)).toBe(50);
    expect(dailyQuestBonus(75)).toBe(38);
  });
});

describe('dayKey', () => {
  it('is a zero-padded local calendar day', () => {
    expect(dayKey(new Date(2026, 7, 7))).toBe('2026-08-07');
    expect(dayKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
