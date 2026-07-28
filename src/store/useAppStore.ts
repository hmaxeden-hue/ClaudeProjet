import { create } from 'zustand';
import type {
  Area,
  Goal,
  LogEntry,
  Profile,
  Resource,
  SkillNode,
} from '../types/models';
import { repository } from '../data/repository';
import { buildSeedData } from '../data/seed';
import { createId } from '../lib/id';
import { levelFromXp } from '../lib/xp';
import { recomputeNodeStatuses } from '../lib/tree';

export type AppStatus = 'loading' | 'setup' | 'ready';

export interface XpToast {
  id: number;
  amount: number;
  color: string;
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

export const DEFAULT_GOAL_XP = 100;

interface AppState {
  status: AppStatus;
  profile: Profile | null;
  areas: Area[];
  nodes: SkillNode[];
  logs: LogEntry[];
  goals: Goal[];
  resources: Resource[];
  xpToast: XpToast | null;
  levelUp: LevelUpEvent | null;

  init: () => Promise<void>;
  createProfile: (name: string) => Promise<void>;

  logActivity: (input: {
    areaId: string;
    nodeId?: string;
    description: string;
    xp: number;
  }) => Promise<void>;
  deleteLog: (logId: string) => Promise<void>;

  completeNode: (nodeId: string) => Promise<void>;
  saveNode: (
    node: Omit<SkillNode, 'status'> & { status?: SkillNode['status'] },
  ) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;

  saveArea: (area: Area) => Promise<void>;
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
}

let feedbackCounter = 0;

export const useAppStore = create<AppState>((set, get) => {
  /**
   * Adds XP to an area, writes a log entry, persists both and triggers
   * the XP toast / level-up feedback. Central path for every XP source.
   */
  async function gainXp(input: {
    areaId: string;
    nodeId?: string;
    description: string;
    xp: number;
  }): Promise<void> {
    const { areas } = get();
    const area = areas.find((a) => a.id === input.areaId);
    if (!area) return;

    const levelBefore = levelFromXp(area.xp);
    const updatedArea: Area = { ...area, xp: area.xp + input.xp };
    const levelAfter = levelFromXp(updatedArea.xp);

    const entry: LogEntry = {
      id: createId(),
      areaId: input.areaId,
      nodeId: input.nodeId,
      description: input.description,
      xp: input.xp,
      timestamp: new Date().toISOString(),
    };

    const feedbackId = ++feedbackCounter;
    set((state) => ({
      areas: state.areas.map((a) => (a.id === updatedArea.id ? updatedArea : a)),
      logs: [entry, ...state.logs],
      xpToast: { id: feedbackId, amount: input.xp, color: area.color },
      levelUp:
        levelAfter > levelBefore
          ? {
              id: feedbackId,
              areaName: area.name,
              areaIcon: area.icon,
              color: area.color,
              level: levelAfter,
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

    await repository.saveArea(updatedArea);
    await repository.addLog(entry);
  }

  return {
    status: 'loading',
    profile: null,
    areas: [],
    nodes: [],
    logs: [],
    goals: [],
    resources: [],
    xpToast: null,
    levelUp: null,

    init: async () => {
      const data = await repository.loadAll();
      if (!data.profile) {
        set({ status: 'setup' });
        return;
      }
      data.logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      set({ ...data, status: 'ready' });
    },

    createProfile: async (name: string) => {
      const profile: Profile = {
        id: 'profile',
        name: name.trim() || 'Held:in',
        createdAt: new Date().toISOString(),
      };
      const { areas, nodes } = buildSeedData();
      await repository.seed({
        profile,
        areas,
        nodes,
        logs: [],
        goals: [],
        resources: [],
      });
      set({
        profile,
        areas,
        nodes,
        logs: [],
        goals: [],
        resources: [],
        status: 'ready',
      });
    },

    logActivity: async (input) => {
      await gainXp(input);
    },

    deleteLog: async (logId) => {
      set((state) => ({ logs: state.logs.filter((l) => l.id !== logId) }));
      await repository.deleteLog(logId);
    },

    completeNode: async (nodeId) => {
      const { nodes } = get();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node || node.status !== 'available') return;

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
      await gainXp({
        areaId: node.areaId,
        nodeId: node.id,
        description: `Skill abgeschlossen: ${node.title}`,
        xp: node.xpReward,
      });
    },

    saveNode: async (input) => {
      const { nodes } = get();
      const existing = nodes.find((n) => n.id === input.id);
      const node: SkillNode = {
        ...input,
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
    },

    deleteArea: async (areaId) => {
      set((state) => ({
        areas: state.areas.filter((a) => a.id !== areaId),
        nodes: state.nodes.filter((n) => n.areaId !== areaId),
        logs: state.logs.filter((l) => l.areaId !== areaId),
        goals: state.goals.filter((g) => g.areaId !== areaId),
        resources: state.resources.filter((r) => r.areaId !== areaId),
      }));
      await repository.deleteArea(areaId);
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
        areaId: goal.areaId,
        description: `Ziel erreicht: ${goal.title}`,
        xp: goal.xpReward,
      });
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
          areaId: resource.areaId,
          nodeId: resource.nodeId,
          description: `Ressource abgeschlossen: ${resource.title}`,
          xp: RESOURCE_XP[resource.type],
        });
      }
    },

    deleteResource: async (resourceId) => {
      set((state) => ({
        resources: state.resources.filter((r) => r.id !== resourceId),
      }));
      await repository.deleteResource(resourceId);
    },
  };
});
