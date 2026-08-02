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
  /**
   * Areas this one overlaps with. Learning Spanish also trains communication,
   * so activities logged here pre-select those areas and credit them too.
   */
  linkedAreaIds?: string[];
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
  /** The area this was primarily logged for. */
  areaId: string;
  /**
   * Further areas the same activity counted for. One activity can genuinely
   * advance several areas – speaking Spanish with someone trains the language
   * *and* communication – so each of them receives the full reward.
   */
  secondaryAreaIds?: string[];
  nodeId?: string;
  description: string;
  xp: number;
  timestamp: string;
  /** How much was done – kept for the record, XP is derived from it. */
  scope?: 'small' | 'normal' | 'large';
}

export type GoalStatus = 'open' | 'achieved';

export interface Goal {
  id: string;
  areaId: string;
  title: string;
  description: string;
  targetDate?: string;
  status: GoalStatus;
  /** Effort class chosen by the user; the reward follows from it. */
  size?: 'small' | 'medium' | 'large';
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
