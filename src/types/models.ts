/** Core domain types for Life RPG. */

/** The skill singled out for today, with bonus XP for finishing it today. */
export interface DailyQuestState {
  /** Local calendar day the quest belongs to, as YYYY-MM-DD. */
  day: string;
  nodeId: string;
  /** True once the bonus has been paid out, so it cannot be earned twice. */
  completed: boolean;
}

export interface Profile {
  /** Singleton record, always 'profile'. */
  id: string;
  name: string;
  avatar?: string;
  createdAt: string;
  dailyQuest?: DailyQuestState;
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
  /** Main and side tracks of this area's tree. Empty for older areas. */
  tracks?: AreaTrack[];
}

export type NodeStatus = 'locked' | 'available' | 'completed';
export type NodeType = 'milestone' | 'quest' | 'habit';

/**
 * A goal-driven strand of nodes inside an area. Every area has exactly one
 * main track leading to the main goal; side tracks branch off it for secondary
 * goals and may depend on main-track nodes.
 */
export interface AreaTrack {
  id: string;
  /** The goal this strand leads to – shown as the track's headline. */
  title: string;
  isMain: boolean;
}

export interface SkillNode {
  id: string;
  areaId: string;
  /** Which track this belongs to. Missing means the main track. */
  trackId?: string;
  title: string;
  description: string;
  /**
   * Concrete steps for actually doing this. The difference between a journal
   * ("read a book") and an instruction ("pick one of these three, 20 pages a
   * day, note one takeaway per chapter").
   */
  howTo?: string[];
  /**
   * True when the written record *is* the deliverable – "note for 21 days how
   * the conversations went", "put together a reading list". Those tasks offer
   * the note field up front instead of hiding it behind a click.
   */
  needsNotes?: boolean;
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

/**
 * A note written while working on a skill. Notes are what the journal is made
 * of: for many tasks the record itself is the point, not a side effect.
 */
export interface Note {
  id: string;
  nodeId: string;
  /** Kept alongside the node id so the journal can colour entries by area. */
  areaId: string;
  text: string;
  createdAt: string;
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
  notes: Note[];
  achievements: AchievementUnlock[];
}
