import type { LogEntry } from '../types/models';

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Days in a row (ending today or yesterday) with at least one activity.
 * A streak that was fed yesterday but not yet today still counts.
 */
export function currentStreak(logs: LogEntry[]): number {
  const days = new Set(logs.map((l) => dayKey(new Date(l.timestamp))));
  if (days.size === 0) return 0;

  const cursor = new Date();
  // Allow the streak to start counting from yesterday if today has no entry yet.
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
