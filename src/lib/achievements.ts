import type { Area, Goal, LogEntry, Resource, SkillNode } from '../types/models';
import { levelFromXp } from './xp';

/** Snapshot the achievement predicates are evaluated against. */
export interface AchievementContext {
  areas: Area[];
  nodes: SkillNode[];
  logs: LogEntry[];
  goals: Goal[];
  resources: Resource[];
  streak: number;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Visual weight – higher tiers are rarer and rendered more prominently. */
  tier: 'bronze' | 'silver' | 'gold';
  isUnlocked: (ctx: AchievementContext) => boolean;
  /** Current value / target, used to render a progress hint while locked. */
  progress?: (ctx: AchievementContext) => { current: number; target: number };
}

const completedNodes = (ctx: AchievementContext) =>
  ctx.nodes.filter((n) => n.status === 'completed').length;

const achievedGoals = (ctx: AchievementContext) =>
  ctx.goals.filter((g) => g.status === 'achieved').length;

const doneResources = (ctx: AchievementContext, type?: Resource['type']) =>
  ctx.resources.filter(
    (r) => r.status === 'done' && (type ? r.type === type : true),
  ).length;

const highestAreaLevel = (ctx: AchievementContext) =>
  Math.max(1, ...ctx.areas.map((a) => levelFromXp(a.xp)));

/** Number of distinct areas that have at least one activity logged. */
const touchedAreas = (ctx: AchievementContext) =>
  new Set(
    ctx.logs.flatMap((l) => [l.areaId, ...(l.secondaryAreaIds ?? [])]),
  ).size;

/** Counting-style achievement: unlocked once `value` reaches `target`. */
function counter(
  base: Omit<AchievementDefinition, 'isUnlocked' | 'progress'>,
  value: (ctx: AchievementContext) => number,
  target: number,
): AchievementDefinition {
  return {
    ...base,
    isUnlocked: (ctx) => value(ctx) >= target,
    progress: (ctx) => ({ current: Math.min(value(ctx), target), target }),
  };
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  counter(
    {
      id: 'first-step',
      title: 'Der erste Schritt',
      description: 'Protokolliere deine erste Aktivität.',
      icon: '👣',
      tier: 'bronze',
    },
    (ctx) => ctx.logs.length,
    1,
  ),
  counter(
    {
      id: 'ten-activities',
      title: 'In Bewegung',
      description: 'Protokolliere 10 Aktivitäten.',
      icon: '⚡',
      tier: 'bronze',
    },
    (ctx) => ctx.logs.length,
    10,
  ),
  counter(
    {
      id: 'fifty-activities',
      title: 'Unaufhaltsam',
      description: 'Protokolliere 50 Aktivitäten.',
      icon: '🌊',
      tier: 'silver',
    },
    (ctx) => ctx.logs.length,
    50,
  ),
  counter(
    {
      id: 'first-node',
      title: 'Skill freigeschaltet',
      description: 'Schließe deinen ersten Skill ab.',
      icon: '🗝️',
      tier: 'bronze',
    },
    completedNodes,
    1,
  ),
  counter(
    {
      id: 'ten-nodes',
      title: 'Baumeister',
      description: 'Schließe 10 Skills ab.',
      icon: '🌳',
      tier: 'silver',
    },
    completedNodes,
    10,
  ),
  counter(
    {
      id: 'twentyfive-nodes',
      title: 'Meister des Baums',
      description: 'Schließe 25 Skills ab.',
      icon: '🏛️',
      tier: 'gold',
    },
    completedNodes,
    25,
  ),
  counter(
    {
      id: 'streak-3',
      title: 'Dranbleiber',
      description: 'Sei 3 Tage in Folge aktiv.',
      icon: '🔥',
      tier: 'bronze',
    },
    (ctx) => ctx.streak,
    3,
  ),
  counter(
    {
      id: 'streak-7',
      title: 'Eine Woche am Stück',
      description: 'Sei 7 Tage in Folge aktiv.',
      icon: '🔥',
      tier: 'silver',
    },
    (ctx) => ctx.streak,
    7,
  ),
  counter(
    {
      id: 'streak-30',
      title: 'Monat der Disziplin',
      description: 'Sei 30 Tage in Folge aktiv.',
      icon: '☄️',
      tier: 'gold',
    },
    (ctx) => ctx.streak,
    30,
  ),
  counter(
    {
      id: 'area-level-5',
      title: 'Spezialist',
      description: 'Erreiche Level 5 in einem Bereich.',
      icon: '⭐',
      tier: 'silver',
    },
    highestAreaLevel,
    5,
  ),
  counter(
    {
      id: 'area-level-10',
      title: 'Experte',
      description: 'Erreiche Level 10 in einem Bereich.',
      icon: '🌟',
      tier: 'gold',
    },
    highestAreaLevel,
    10,
  ),
  {
    id: 'balanced',
    title: 'Im Gleichgewicht',
    description: 'Erreiche Level 3 oder höher in allen deinen Bereichen.',
    icon: '⚖️',
    tier: 'gold',
    isUnlocked: (ctx) =>
      ctx.areas.length > 0 && ctx.areas.every((a) => levelFromXp(a.xp) >= 3),
    progress: (ctx) => ({
      current: ctx.areas.filter((a) => levelFromXp(a.xp) >= 3).length,
      target: ctx.areas.length,
    }),
  },
  counter(
    {
      id: 'all-rounder',
      title: 'Allrounder',
      description: 'Sei in mindestens 5 verschiedenen Bereichen aktiv gewesen.',
      icon: '🎭',
      tier: 'silver',
    },
    touchedAreas,
    5,
  ),
  counter(
    {
      id: 'first-goal',
      title: 'Zielstrebig',
      description: 'Erreiche dein erstes Ziel.',
      icon: '🎯',
      tier: 'bronze',
    },
    achievedGoals,
    1,
  ),
  counter(
    {
      id: 'five-goals',
      title: 'Vollstrecker',
      description: 'Erreiche 5 Ziele.',
      icon: '🏹',
      tier: 'silver',
    },
    achievedGoals,
    5,
  ),
  counter(
    {
      id: 'first-resource',
      title: 'Durchgearbeitet',
      description: 'Schließe deine erste Ressource ab.',
      icon: '✅',
      tier: 'bronze',
    },
    (ctx) => doneResources(ctx),
    1,
  ),
  counter(
    {
      id: 'bookworm',
      title: 'Leseratte',
      description: 'Lies 5 Bücher zu Ende.',
      icon: '📚',
      tier: 'silver',
    },
    (ctx) => doneResources(ctx, 'book'),
    5,
  ),
  counter(
    {
      id: 'library',
      title: 'Eigene Bibliothek',
      description: 'Sammle 15 Ressourcen in deiner Bibliothek.',
      icon: '🗄️',
      tier: 'silver',
    },
    (ctx) => ctx.resources.length,
    15,
  ),
  counter(
    {
      id: 'own-area',
      title: 'Eigener Weg',
      description: 'Lege einen eigenen Bereich an.',
      icon: '🧩',
      tier: 'bronze',
    },
    (ctx) => ctx.areas.filter((a) => a.isCustom).length,
    1,
  ),
  counter(
    {
      id: 'thousand-xp',
      title: '1.000 XP',
      description: 'Sammle insgesamt 1.000 XP.',
      icon: '💎',
      tier: 'silver',
    },
    (ctx) => ctx.areas.reduce((sum, a) => sum + a.xp, 0),
    1000,
  ),
  counter(
    {
      id: 'tenthousand-xp',
      title: '10.000 XP',
      description: 'Sammle insgesamt 10.000 XP.',
      icon: '👑',
      tier: 'gold',
    },
    (ctx) => ctx.areas.reduce((sum, a) => sum + a.xp, 0),
    10000,
  ),
];

export const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Ids that are newly satisfied but not yet in `alreadyUnlocked`. */
export function findNewlyUnlocked(
  ctx: AchievementContext,
  alreadyUnlocked: Set<string>,
): AchievementDefinition[] {
  return ACHIEVEMENTS.filter(
    (a) => !alreadyUnlocked.has(a.id) && a.isUnlocked(ctx),
  );
}
