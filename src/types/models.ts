/** Core domain types for Life RPG. */

export interface Profile {
  /** Singleton record, always 'profile'. */
  id: string;
  name: string;
  avatar?: string;
  createdAt: string;
}

/** A quick-log preset shown in the activity form. */
export interface SuggestedActivity {
  label: string;
  xp: number;
}

export interface Area {
  id: string;
  name: string;
  /** Emoji used as the area icon. */
  icon: string;
  /** Accent color (hex) used across the UI for this area. */
  color: string;
  description: string;
  /** Total accumulated XP. Level is derived from this value. */
  xp: number;
  sortOrder: number;
  /** True for user-created areas (they can be deleted). */
  isCustom: boolean;
  suggestedActivities: SuggestedActivity[];
}

export type NodeStatus = 'locked' | 'available' | 'completed';
export type NodeType = 'milestone' | 'quest' | 'habit';

export interface SkillNode {
  id: string;
  areaId: string;
  title: string;
  description: string;
  /** Node ids that must be completed before this node becomes available. */
  prerequisites: string[];
  xpReward: number;
  status: NodeStatus;
  type: NodeType;
  completedAt?: string;
}

export interface LogEntry {
  id: string;
  areaId: string;
  nodeId?: string;
  description: string;
  xp: number;
  timestamp: string;
}

export type GoalStatus = 'open' | 'achieved';

export interface Goal {
  id: string;
  areaId: string;
  title: string;
  description: string;
  targetDate?: string;
  status: GoalStatus;
  xpReward: number;
  achievedAt?: string;
}

export type ResourceType = 'book' | 'video' | 'course' | 'other';
export type ResourceStatus = 'todo' | 'in_progress' | 'done';

export interface Resource {
  id: string;
  areaId: string;
  nodeId?: string;
  type: ResourceType;
  title: string;
  url?: string;
  status: ResourceStatus;
}

/** A badge the user has earned. Definitions live in lib/achievements.ts. */
export interface AchievementUnlock {
  /** Matches the id of an AchievementDefinition. */
  id: string;
  unlockedAt: string;
}

/** Everything the app persists, loaded in one go at startup. */
export interface AppData {
  profile: Profile | null;
  areas: Area[];
  nodes: SkillNode[];
  logs: LogEntry[];
  goals: Goal[];
  resources: Resource[];
  achievements: AchievementUnlock[];
}
