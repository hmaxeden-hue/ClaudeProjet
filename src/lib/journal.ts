import type { LogEntry, Note, SkillNode } from '../types/models';
import { dayKey } from './dailyQuest';

/**
 * The journal groups everything that happened by calendar day.
 *
 * Notes are the substance – for many tasks the written record *is* the
 * deliverable. Activities and finished skills come along as context, so a day
 * reads as "what I did and what I thought about it" rather than two disjoint
 * lists in two places.
 */

export interface JournalDay {
  /** Local calendar day as YYYY-MM-DD, usable as a stable key. */
  day: string;
  /** Newest first, like everything else in the app. */
  notes: Note[];
  activities: LogEntry[];
  completedNodes: SkillNode[];
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}

/**
 * Builds the day list, newest first.
 *
 * Only days that actually contain something are returned. A journal padded
 * with empty days would bury the entries it exists to show — the gaps are
 * still visible in the dates themselves.
 */
export function buildJournal(
  notes: Note[],
  logs: LogEntry[],
  nodes: SkillNode[],
): JournalDay[] {
  const notesByDay = new Map<string, Note[]>();
  const logsByDay = new Map<string, LogEntry[]>();
  const nodesByDay = new Map<string, SkillNode[]>();

  for (const note of notes) {
    push(notesByDay, dayKey(new Date(note.createdAt)), note);
  }
  for (const log of logs) {
    push(logsByDay, dayKey(new Date(log.timestamp)), log);
  }
  for (const node of nodes) {
    if (node.status === 'completed' && node.completedAt) {
      push(nodesByDay, dayKey(new Date(node.completedAt)), node);
    }
  }

  const days = new Set([
    ...notesByDay.keys(),
    ...logsByDay.keys(),
    ...nodesByDay.keys(),
  ]);

  const byNewest = <T>(items: T[], at: (item: T) => string) =>
    [...items].sort((a, b) => at(b).localeCompare(at(a)));

  return [...days]
    .sort((a, b) => b.localeCompare(a))
    .map((day) => ({
      day,
      notes: byNewest(notesByDay.get(day) ?? [], (n) => n.createdAt),
      activities: byNewest(logsByDay.get(day) ?? [], (l) => l.timestamp),
      completedNodes: byNewest(
        nodesByDay.get(day) ?? [],
        (n) => n.completedAt ?? '',
      ),
    }));
}

/** "Heute", "Gestern" or a spelled-out German date. */
export function formatJournalDay(day: string, today = dayKey()): string {
  if (day === today) return 'Heute';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === dayKey(yesterday)) return 'Gestern';

  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
