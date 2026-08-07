import { describe, expect, it } from 'vitest';
import { buildJournal, formatJournalDay } from './journal';
import { dayKey } from './dailyQuest';
import type { LogEntry, Note, SkillNode } from '../types/models';

/** Local noon on the given day, so time-zone shifts cannot move the date. */
const at = (day: string, hour = 12) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour).toISOString();
};

const note = (id: string, day: string, hour = 12): Note => ({
  id,
  nodeId: 'node-1',
  areaId: 'area-1',
  text: `Notiz ${id}`,
  createdAt: at(day, hour),
});

const log = (id: string, day: string): LogEntry => ({
  id,
  areaId: 'area-1',
  description: `Aktivität ${id}`,
  xp: 25,
  timestamp: at(day),
});

const node = (id: string, day?: string): SkillNode => ({
  id,
  areaId: 'area-1',
  title: `Skill ${id}`,
  description: '',
  prerequisites: [],
  xpReward: 50,
  status: day ? 'completed' : 'available',
  type: 'quest',
  completedAt: day ? at(day) : undefined,
});

describe('buildJournal', () => {
  it('groups notes, activities and finished skills by day, newest first', () => {
    const days = buildJournal(
      [note('n1', '2026-08-05'), note('n2', '2026-08-07')],
      [log('l1', '2026-08-07')],
      [node('s1', '2026-08-06'), node('s2')],
    );

    expect(days.map((d) => d.day)).toEqual([
      '2026-08-07',
      '2026-08-06',
      '2026-08-05',
    ]);
    expect(days[0].notes.map((n) => n.id)).toEqual(['n2']);
    expect(days[0].activities.map((l) => l.id)).toEqual(['l1']);
    expect(days[1].completedNodes.map((n) => n.id)).toEqual(['s1']);
    // An unfinished skill belongs to no day at all.
    expect(days.flatMap((d) => d.completedNodes).map((n) => n.id)).toEqual([
      's1',
    ]);
  });

  it('sorts several notes of one day newest first', () => {
    const days = buildJournal(
      [
        note('morgens', '2026-08-07', 8),
        note('abends', '2026-08-07', 21),
        note('mittags', '2026-08-07', 13),
      ],
      [],
      [],
    );

    expect(days).toHaveLength(1);
    expect(days[0].notes.map((n) => n.id)).toEqual([
      'abends',
      'mittags',
      'morgens',
    ]);
  });

  it('leaves out days on which nothing happened', () => {
    const days = buildJournal(
      [note('n1', '2026-08-01'), note('n2', '2026-08-10')],
      [],
      [],
    );

    // Nine days lie in between; padding them would bury the two real entries.
    expect(days.map((d) => d.day)).toEqual(['2026-08-10', '2026-08-01']);
  });

  it('returns nothing for an empty journal', () => {
    expect(buildJournal([], [], [])).toEqual([]);
  });
});

describe('formatJournalDay', () => {
  it('names today and yesterday instead of dating them', () => {
    const today = dayKey();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);

    expect(formatJournalDay(today, today)).toBe('Heute');
    expect(formatJournalDay(dayKey(yesterdayDate), today)).toBe('Gestern');
  });

  it('spells out older days in German', () => {
    expect(formatJournalDay('2026-08-05', '2026-08-20')).toBe(
      'Mittwoch, 05. August 2026',
    );
  });
});
