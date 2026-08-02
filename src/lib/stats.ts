import type { Area, LogEntry, Profile } from '../types/models';
import type { MemberStats } from '../types/groups';
import { levelFromXp } from './xp';
import { currentStreak } from './streak';

/**
 * Builds the snapshot that group members are allowed to see.
 *
 * This is the single place that decides what leaves the account, which is why
 * it takes the whole state but returns so little: name, levels and streak. The
 * numbers match what the user sees in their own header, so nobody is surprised
 * by what friends can read.
 */
export function statsSnapshot(
  profile: Profile | null,
  areas: Area[],
  logs: LogEntry[],
): Omit<MemberStats, 'userId' | 'updatedAt'> {
  return {
    displayName: profile?.name?.trim() || 'Held:in',
    level: areas.reduce((sum, a) => sum + levelFromXp(a.xp), 0),
    totalXp: areas.reduce((sum, a) => sum + a.xp, 0),
    streak: currentStreak(logs),
    areaLevels: areas.map((a) => ({
      name: a.name,
      icon: a.icon,
      color: a.color,
      level: levelFromXp(a.xp),
    })),
  };
}
