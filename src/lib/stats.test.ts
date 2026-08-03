import { describe, expect, it } from 'vitest';
import { statsSnapshot } from './stats';
import { levelFromXp, totalXpForLevel } from './xp';
import type { Area, LogEntry, Profile } from '../types/models';

const profile: Profile = {
  id: 'profile',
  name: 'Max',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const area = (id: string, xp: number): Area => ({
  id,
  name: id,
  icon: '⭐',
  color: '#38bdf8',
  description: `Beschreibung von ${id}`,
  xp,
  sortOrder: 0,
  isCustom: false,
  suggestedActivities: [{ label: 'Geübt', xp: 25 }],
});

const log = (daysAgo: number): LogEntry => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    id: `log-${daysAgo}`,
    areaId: 'knowledge',
    description: 'Vertrauliche Notiz über mein Gehalt',
    xp: 25,
    timestamp: date.toISOString(),
  };
};

describe('statsSnapshot', () => {
  it('shares nothing beyond name, levels and streak', () => {
    const snapshot = statsSnapshot(
      profile,
      [area('knowledge', 500), area('health', 100)],
      [log(0), log(1)],
    );

    // Whatever is added to the domain later must not leak here by accident.
    expect(Object.keys(snapshot).sort()).toEqual([
      'areaLevels',
      'displayName',
      'level',
      'streak',
      'totalXp',
    ]);
    expect(Object.keys(snapshot.areaLevels[0]).sort()).toEqual([
      'color',
      'icon',
      'level',
      'name',
    ]);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('Gehalt');
    expect(serialized).not.toContain('Beschreibung von');
    expect(serialized).not.toContain('Geübt');
  });

  it('reports the same character level the header shows', () => {
    const areas = [area('knowledge', 500), area('health', 100)];
    const snapshot = statsSnapshot(profile, areas, []);

    expect(snapshot.level).toBe(
      levelFromXp(500) + levelFromXp(100),
    );
    expect(snapshot.totalXp).toBe(600);
    expect(snapshot.areaLevels.map((a) => a.level)).toEqual([
      levelFromXp(500),
      levelFromXp(100),
    ]);
  });

  it('counts the streak of consecutive active days', () => {
    const snapshot = statsSnapshot(profile, [area('knowledge', 0)], [
      log(0),
      log(1),
      log(2),
      log(5),
    ]);

    expect(snapshot.streak).toBe(3);
  });

  it('falls back to a neutral name instead of publishing an empty one', () => {
    const snapshot = statsSnapshot(
      { ...profile, name: '   ' },
      [area('knowledge', totalXpForLevel(3))],
      [],
    );

    expect(snapshot.displayName).toBe('Held:in');
    expect(statsSnapshot(null, [], []).displayName).toBe('Held:in');
  });
});
