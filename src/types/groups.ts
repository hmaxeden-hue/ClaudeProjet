/**
 * Group types. Unlike the rest of the domain these cross account borders, so
 * everything here is deliberately narrow: a member's snapshot carries name,
 * levels and streak — never activities, skills, goals or notes.
 */

export interface Group {
  id: string;
  name: string;
  /** Short code friends type in to join. */
  inviteCode: string;
  createdBy: string;
  createdAt: string;
}

/** Per-area level of a member, without any XP breakdown. */
export interface AreaLevel {
  name: string;
  icon: string;
  color: string;
  level: number;
}

/** The published snapshot – everything others are allowed to see. */
export interface MemberStats {
  userId: string;
  displayName: string;
  /** Character level: the sum of all area levels, same as in the header. */
  level: number;
  totalXp: number;
  streak: number;
  areaLevels: AreaLevel[];
  updatedAt: string;
}

export interface GroupMember {
  userId: string;
  displayName: string;
  joinedAt: string;
  /** Missing while a member has not published anything yet. */
  stats?: MemberStats;
}
