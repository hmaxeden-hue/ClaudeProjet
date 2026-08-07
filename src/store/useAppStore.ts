import { create } from 'zustand';
import type {
  AchievementUnlock,
  Area,
  Goal,
  LogEntry,
  Note,
  Profile,
  Resource,
  SkillNode,
} from '../types/models';
import { repository } from '../data/repository';
import {
  generateSetup,
  type BuiltArea,
  type OnboardingAnswers,
  type ResolvedNode,
} from '../data/onboarding';
import { createId } from '../lib/id';
import { levelFromXp, xpForActivity, xpForNode, type ActivityScope } from '../lib/xp';
import { nodeDepths, recomputeNodeStatuses } from '../lib/tree';
import { currentStreak } from '../lib/streak';
import { dailyQuestBonus, dayKey, resolveDailyQuest } from '../lib/dailyQuest';
import { findNewlyUnlocked } from '../lib/achievements';
import { statsSnapshot } from '../lib/stats';
import { publishMyStats } from '../data/groups';

export type AppStatus = 'loading' | 'setup' | 'ready';

export interface XpToast {
  id: number;
  amount: number;
  color: string;
  /** How many areas received the reward – shown when it counted more than once. */
  areaCount: number;
}

export interface LevelUpEvent {
  id: number;
  areaName: string;
  areaIcon: string;
  color: string;
  level: number;
}

/** XP awarded when a resource is marked as done, by resource type. */
export const RESOURCE_XP: Record<Resource['type'], number> = {
  book: 100,
  video: 25,
  course: 150,
  other: 40,
};

interface AppState {
  status: AppStatus;
  profile: Profile | null;
  areas: Area[];
  nodes: SkillNode[];
  logs: LogEntry[];
  goals: Goal[];
  resources: Resource[];
  notes: Note[];
  achievements: AchievementUnlock[];
  xpToast: XpToast | null;
  levelUp: LevelUpEvent | null;
  /** Achievement ids waiting to be celebrated, oldest first. */
  pendingAchievements: string[];

  init: () => Promise<void>;
  completeOnboarding: (input: {
    name: string;
    selectedAreaIds: string[];
    answers: OnboardingAnswers;
    /** AI-designed trees per area; areas without one fall back to templates. */
    aiNodesByArea?: Record<string, ResolvedNode[]>;
  }) => Promise<void>;

  logActivity: (input: {
    areaId: string;
    /** Further areas the activity also counts for; each gets the full reward. */
    secondaryAreaIds?: string[];
    nodeId?: string;
    description: string;
    /** Catalog value of the activity; the reward is derived from it. */
    baseXp: number;
    scope: ActivityScope;
  }) => Promise<void>;
  deleteLog: (logId: string) => Promise<void>;

  completeNode: (nodeId: string) => Promise<void>;
  /** Re-picks today's quest when the stored one is stale. */
  refreshDailyQuest: () => Promise<void>;
  saveNode: (
    node: Omit<SkillNode, 'status' | 'xpReward'> & {
      status?: SkillNode['status'];
    },
  ) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;

  saveArea: (area: Area) => Promise<void>;
  /** Adds a self-created area together with its generated tree and goal. */
  addAreaWithTree: (built: BuiltArea) => Promise<void>;
  deleteArea: (areaId: string) => Promise<void>;

  saveGoal: (goal: Goal) => Promise<void>;
  achieveGoal: (goalId: string) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;

  saveResource: (resource: Resource) => Promise<void>;
  setResourceStatus: (
    resourceId: string,
    status: Resource['status'],
  ) => Promise<void>;
  deleteResource: (resourceId: string) => Promise<void>;

  /** Writes a journal note for a skill. Empty text is ignored. */
  saveNote: (input: { nodeId: string; text: string }) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;

  dismissAchievement: () => void;
}

let feedbackCounter = 0;

export const useAppStore = create<AppState>((set, get) => {
  /**
   * Evaluates all badge conditions against the current state and records
   * the ones that just became true. Cheap enough to run after every change.
   */
  async function checkAchievements(): Promise<void> {
    const { areas, nodes, logs, goals, resources, notes, achievements } = get();
    const alreadyUnlocked = new Set(achievements.map((a) => a.id));
    const newly = findNewlyUnlocked(
      {
        areas,
        nodes,
        logs,
        goals,
        resources,
        notes,
        streak: currentStreak(logs),
      },
      alreadyUnlocked,
    );
    if (newly.length === 0) return;

    const now = new Date().toISOString();
    const records: AchievementUnlock[] = newly.map((a) => ({
      id: a.id,
      unlockedAt: now,
    }));
    set((state) => ({
      achievements: [...state.achievements, ...records],
      pendingAchievements: [
        ...state.pendingAchievements,
        ...newly.map((a) => a.id),
      ],
    }));
    await repository.addAchievements(records);
  }

  /**
   * Adds XP to an area, writes a log entry, persists both and triggers
   * the XP toast / level-up feedback. Central path for every XP source.
   */
  async function gainXp(input: {
    /** First entry is the primary area; every listed area receives the reward. */
    areaIds: string[];
    nodeId?: string;
    description: string;
    xp: number;
    scope?: ActivityScope;
  }): Promise<void> {
    const { areas } = get();
    const credited = input.areaIds
      .map((id) => areas.find((a) => a.id === id))
      .filter((a): a is Area => Boolean(a));
    if (credited.length === 0) return;

    const updatedAreas = credited.map((area) => ({
      before: levelFromXp(area.xp),
      area: { ...area, xp: area.xp + input.xp } as Area,
    }));

    // Celebrate the first area that gained a level; the rest is visible on the
    // dashboard. Queueing several full-screen overlays would be noise.
    const levelled = updatedAreas.find(
      ({ area, before }) => levelFromXp(area.xp) > before,
    );

    const entry: LogEntry = {
      id: createId(),
      areaId: credited[0].id,
      secondaryAreaIds:
        credited.length > 1 ? credited.slice(1).map((a) => a.id) : undefined,
      nodeId: input.nodeId,
      description: input.description,
      xp: input.xp,
      timestamp: new Date().toISOString(),
      scope: input.scope,
    };

    const feedbackId = ++feedbackCounter;
    const byId = new Map(updatedAreas.map(({ area }) => [area.id, area]));
    set((state) => ({
      areas: state.areas.map((a) => byId.get(a.id) ?? a),
      logs: [entry, ...state.logs],
      xpToast: {
        id: feedbackId,
        amount: input.xp,
        color: credited[0].color,
        areaCount: credited.length,
      },
      levelUp: levelled
        ? {
            id: feedbackId,
            areaName: levelled.area.name,
            areaIcon: levelled.area.icon,
            color: levelled.area.color,
            level: levelFromXp(levelled.area.xp),
          }
        : get().levelUp,
    }));

    // Auto-dismiss feedback after a short moment.
    window.setTimeout(() => {
      const state = get();
      set({
        xpToast: state.xpToast?.id === feedbackId ? null : state.xpToast,
        levelUp: state.levelUp?.id === feedbackId ? null : state.levelUp,
      });
    }, 3200);

    for (const { area } of updatedAreas) await repository.saveArea(area);
    await repository.addLog(entry);

    // Let group members see the new numbers. Signed out this does nothing, and
    // offline it fails – neither may hold up or break logging an activity.
    const { profile, areas: current, logs } = get();
    void publishMyStats(statsSnapshot(profile, current, logs)).catch(
      () => undefined,
    );
  }

  return {
    status: 'loading',
    profile: null,
    areas: [],
    nodes: [],
    logs: [],
    goals: [],
    resources: [],
    notes: [],
    achievements: [],
    xpToast: null,
    levelUp: null,
    pendingAchievements: [],

    init: async () => {
      const data = await repository.loadAll();
      if (!data.profile) {
        set({ status: 'setup' });
        return;
      }
      data.logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      set({ ...data, status: 'ready' });
      await get().refreshDailyQuest();
    },

    completeOnboarding: async ({
      name,
      selectedAreaIds,
      answers,
      aiNodesByArea,
    }) => {
      const profile: Profile = {
        id: 'profile',
        name: name.trim() || 'Held:in',
        createdAt: new Date().toISOString(),
      };
      const { areas, nodes, goals, logs } = generateSetup(
        selectedAreaIds,
        answers,
        aiNodesByArea,
      );
      await repository.seed({
        profile,
        areas,
        nodes,
        logs,
        goals,
        resources: [],
        notes: [],
        achievements: [],
      });
      set({
        profile,
        areas,
        nodes,
        logs,
        goals,
        resources: [],
        notes: [],
        achievements: [],
        status: 'ready',
      });
      await checkAchievements();
    },

    logActivity: async ({
      areaId,
      secondaryAreaIds = [],
      nodeId,
      description,
      baseXp,
      scope,
    }) => {
      const unique = Array.from(
        new Set([areaId, ...secondaryAreaIds.filter(Boolean)]),
      );
      await gainXp({
        areaIds: unique,
        nodeId,
        description,
        scope,
        xp: xpForActivity(baseXp, scope),
      });
      await checkAchievements();
    },

    deleteLog: async (logId) => {
      set((state) => ({ logs: state.logs.filter((l) => l.id !== logId) }));
      await repository.deleteLog(logId);
    },

    completeNode: async (nodeId) => {
      const { nodes, profile } = get();
      const node = nodes.find((n) => n.id === nodeId);
      // Locked nodes may be ticked off too – the tree suggests an order, it
      // does not police it. Only completing something twice is prevented.
      if (!node || node.status === 'completed') return;

      const completed: SkillNode = {
        ...node,
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
      const updatedNodes = recomputeNodeStatuses(
        nodes.map((n) => (n.id === nodeId ? completed : n)),
      );
      set({ nodes: updatedNodes });
      await repository.saveNodes(updatedNodes);

      const quest = profile?.dailyQuest;
      const isTodaysQuest =
        quest?.nodeId === nodeId &&
        quest.day === dayKey() &&
        !quest.completed;
      const bonus = isTodaysQuest ? dailyQuestBonus(node.xpReward) : 0;

      if (isTodaysQuest && profile) {
        const updated: Profile = {
          ...profile,
          dailyQuest: { ...quest, completed: true },
        };
        set({ profile: updated });
        await repository.saveProfile(updated);
      }

      await gainXp({
        areaIds: [node.areaId],
        nodeId: node.id,
        description: bonus
          ? `Tagesquest abgeschlossen: ${node.title}`
          : `Skill abgeschlossen: ${node.title}`,
        xp: node.xpReward + bonus,
      });
      await checkAchievements();
      await get().refreshDailyQuest();
    },

    /**
     * Makes sure the profile carries a quest for today. Called on start and
     * when the dashboard mounts, so an app left open overnight rolls over.
     */
    refreshDailyQuest: async () => {
      const { profile, nodes } = get();
      if (!profile) return;
      const next = resolveDailyQuest(profile.dailyQuest, nodes, dayKey());
      const current = profile.dailyQuest;
      if (
        next?.day === current?.day &&
        next?.nodeId === current?.nodeId &&
        next?.completed === current?.completed
      ) {
        return;
      }
      const updated: Profile = { ...profile, dailyQuest: next ?? undefined };
      set({ profile: updated });
      await repository.saveProfile(updated);
    },

    saveNode: async (input) => {
      const { nodes } = get();
      const existing = nodes.find((n) => n.id === input.id);

      // The reward follows from kind and depth – only the node being saved is
      // repriced, so already-earned rewards never change retroactively.
      const areaNodes = nodes.filter(
        (n) => n.areaId === input.areaId && n.id !== input.id,
      );
      const depths = nodeDepths(areaNodes);
      const depth =
        input.prerequisites.length === 0
          ? 0
          : Math.max(
              ...input.prerequisites.map((id) => (depths.get(id) ?? 0) + 1),
            );

      const node: SkillNode = {
        ...input,
        xpReward: xpForNode(input.type, depth),
        status: input.status ?? existing?.status ?? 'locked',
      };
      const merged = existing
        ? nodes.map((n) => (n.id === node.id ? node : n))
        : [...nodes, node];
      const updated = recomputeNodeStatuses(merged);
      set({ nodes: updated });
      await repository.saveNodes(updated);
    },

    deleteNode: async (nodeId) => {
      const { nodes } = get();
      // Remove the node and drop it from other nodes' prerequisites.
      const remaining = nodes
        .filter((n) => n.id !== nodeId)
        .map((n) =>
          n.prerequisites.includes(nodeId)
            ? { ...n, prerequisites: n.prerequisites.filter((p) => p !== nodeId) }
            : n,
        );
      const updated = recomputeNodeStatuses(remaining);
      set({ nodes: updated });
      await repository.deleteNode(nodeId);
      await repository.saveNodes(updated);
    },

    saveArea: async (area) => {
      set((state) => {
        const exists = state.areas.some((a) => a.id === area.id);
        const areas = exists
          ? state.areas.map((a) => (a.id === area.id ? area : a))
          : [...state.areas, area];
        areas.sort((a, b) => a.sortOrder - b.sortOrder);
        return { areas };
      });
      await repository.saveArea(area);
      await checkAchievements();
    },

    addAreaWithTree: async ({ area, nodes, goals, logs }) => {
      set((state) => {
        const areas = [...state.areas, area].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        return {
          areas,
          nodes: [...state.nodes, ...nodes],
          goals: [...state.goals, ...goals],
          logs: [...logs, ...state.logs],
        };
      });
      await repository.saveArea(area);
      await repository.saveNodes(nodes);
      for (const goal of goals) await repository.saveGoal(goal);
      for (const log of logs) await repository.addLog(log);
      await checkAchievements();
    },

    deleteArea: async (areaId) => {
      const { areas, logs } = get();
      // An activity that also counted elsewhere stays – it just loses this
      // area. Same for areas that listed the deleted one as overlapping.
      const orphanedLogs = logs
        .filter((l) => l.areaId !== areaId && l.secondaryAreaIds?.includes(areaId))
        .map((l) => ({
          ...l,
          secondaryAreaIds: l.secondaryAreaIds!.filter((id) => id !== areaId),
        }));
      const unlinkedAreas = areas
        .filter((a) => a.id !== areaId && a.linkedAreaIds?.includes(areaId))
        .map((a) => ({
          ...a,
          linkedAreaIds: a.linkedAreaIds!.filter((id) => id !== areaId),
        }));

      const byId = new Map<string, LogEntry>(orphanedLogs.map((l) => [l.id, l]));
      const areaById = new Map(unlinkedAreas.map((a) => [a.id, a]));
      set((state) => ({
        areas: state.areas
          .filter((a) => a.id !== areaId)
          .map((a) => areaById.get(a.id) ?? a),
        nodes: state.nodes.filter((n) => n.areaId !== areaId),
        logs: state.logs
          .filter((l) => l.areaId !== areaId)
          .map((l) => byId.get(l.id) ?? l),
        goals: state.goals.filter((g) => g.areaId !== areaId),
        resources: state.resources.filter((r) => r.areaId !== areaId),
        notes: state.notes.filter((n) => n.areaId !== areaId),
      }));

      await repository.deleteArea(areaId);
      for (const log of orphanedLogs) await repository.addLog(log);
      for (const area of unlinkedAreas) await repository.saveArea(area);
    },

    saveGoal: async (goal) => {
      set((state) => {
        const exists = state.goals.some((g) => g.id === goal.id);
        return {
          goals: exists
            ? state.goals.map((g) => (g.id === goal.id ? goal : g))
            : [...state.goals, goal],
        };
      });
      await repository.saveGoal(goal);
    },

    achieveGoal: async (goalId) => {
      const goal = get().goals.find((g) => g.id === goalId);
      if (!goal || goal.status === 'achieved') return;
      const achieved: Goal = {
        ...goal,
        status: 'achieved',
        achievedAt: new Date().toISOString(),
      };
      set((state) => ({
        goals: state.goals.map((g) => (g.id === goalId ? achieved : g)),
      }));
      await repository.saveGoal(achieved);
      await gainXp({
        areaIds: [goal.areaId],
        description: `Ziel erreicht: ${goal.title}`,
        xp: goal.xpReward,
      });
      await checkAchievements();
    },

    deleteGoal: async (goalId) => {
      set((state) => ({ goals: state.goals.filter((g) => g.id !== goalId) }));
      await repository.deleteGoal(goalId);
    },

    saveResource: async (resource) => {
      set((state) => {
        const exists = state.resources.some((r) => r.id === resource.id);
        return {
          resources: exists
            ? state.resources.map((r) => (r.id === resource.id ? resource : r))
            : [...state.resources, resource],
        };
      });
      await repository.saveResource(resource);
      await checkAchievements();
    },

    setResourceStatus: async (resourceId, status) => {
      const resource = get().resources.find((r) => r.id === resourceId);
      if (!resource || resource.status === status) return;
      const wasDone = resource.status === 'done';
      const updated: Resource = { ...resource, status };
      set((state) => ({
        resources: state.resources.map((r) =>
          r.id === resourceId ? updated : r,
        ),
      }));
      await repository.saveResource(updated);
      // Award XP only on the first transition to done.
      if (status === 'done' && !wasDone) {
        await gainXp({
          areaIds: [resource.areaId],
          nodeId: resource.nodeId,
          description: `Ressource abgeschlossen: ${resource.title}`,
          xp: RESOURCE_XP[resource.type],
        });
      }
      await checkAchievements();
    },

    deleteResource: async (resourceId) => {
      set((state) => ({
        resources: state.resources.filter((r) => r.id !== resourceId),
      }));
      await repository.deleteResource(resourceId);
    },

    saveNote: async ({ nodeId, text }) => {
      const trimmed = text.trim();
      const node = get().nodes.find((n) => n.id === nodeId);
      if (!trimmed || !node) return;

      const note: Note = {
        id: createId(),
        nodeId,
        areaId: node.areaId,
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      set((state) => ({ notes: [note, ...state.notes] }));
      await repository.saveJournalNote(note);
      await checkAchievements();
    },

    deleteNote: async (noteId) => {
      set((state) => ({ notes: state.notes.filter((n) => n.id !== noteId) }));
      await repository.deleteJournalNote(noteId);
    },

    dismissAchievement: () => {
      set((state) => ({
        pendingAchievements: state.pendingAchievements.slice(1),
      }));
    },
  };
});
