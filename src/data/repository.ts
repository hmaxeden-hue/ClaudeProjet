import type {
  AchievementUnlock,
  AppData,
  Area,
  Goal,
  LogEntry,
  Profile,
  Resource,
  SkillNode,
} from '../types/models';
import { db } from './db';

/**
 * Persistence boundary. The rest of the app only talks to this interface,
 * so a real backend can replace the IndexedDB implementation later
 * without touching UI or store code.
 */
export interface LifeRpgRepository {
  loadAll(): Promise<AppData>;
  seed(data: AppData): Promise<void>;

  saveProfile(profile: Profile): Promise<void>;

  saveArea(area: Area): Promise<void>;
  /** Deletes an area including all of its nodes, logs, goals and resources. */
  deleteArea(areaId: string): Promise<void>;

  saveNode(node: SkillNode): Promise<void>;
  saveNodes(nodes: SkillNode[]): Promise<void>;
  deleteNode(nodeId: string): Promise<void>;

  addLog(entry: LogEntry): Promise<void>;
  deleteLog(logId: string): Promise<void>;

  saveGoal(goal: Goal): Promise<void>;
  deleteGoal(goalId: string): Promise<void>;

  saveResource(resource: Resource): Promise<void>;
  deleteResource(resourceId: string): Promise<void>;

  addAchievements(unlocks: AchievementUnlock[]): Promise<void>;
}

class DexieRepository implements LifeRpgRepository {
  async loadAll(): Promise<AppData> {
    const [profiles, areas, nodes, logs, goals, resources, achievements] =
      await Promise.all([
        db.profiles.toArray(),
        db.areas.orderBy('sortOrder').toArray(),
        db.nodes.toArray(),
        db.logs.toArray(),
        db.goals.toArray(),
        db.resources.toArray(),
        db.achievements.toArray(),
      ]);
    return {
      profile: profiles[0] ?? null,
      areas,
      nodes,
      logs,
      goals,
      resources,
      achievements,
    };
  }

  async seed(data: AppData): Promise<void> {
    await db.transaction(
      'rw',
      [
        db.profiles,
        db.areas,
        db.nodes,
        db.logs,
        db.goals,
        db.resources,
        db.achievements,
      ],
      async () => {
        if (data.profile) await db.profiles.put(data.profile);
        await db.areas.bulkPut(data.areas);
        await db.nodes.bulkPut(data.nodes);
        await db.logs.bulkPut(data.logs);
        await db.goals.bulkPut(data.goals);
        await db.resources.bulkPut(data.resources);
        await db.achievements.bulkPut(data.achievements);
      },
    );
  }

  async saveProfile(profile: Profile): Promise<void> {
    await db.profiles.put(profile);
  }

  async saveArea(area: Area): Promise<void> {
    await db.areas.put(area);
  }

  async deleteArea(areaId: string): Promise<void> {
    await db.transaction(
      'rw',
      [db.areas, db.nodes, db.logs, db.goals, db.resources],
      async () => {
        await db.areas.delete(areaId);
        await db.nodes.where('areaId').equals(areaId).delete();
        await db.logs.where('areaId').equals(areaId).delete();
        await db.goals.where('areaId').equals(areaId).delete();
        await db.resources.where('areaId').equals(areaId).delete();
      },
    );
  }

  async saveNode(node: SkillNode): Promise<void> {
    await db.nodes.put(node);
  }

  async saveNodes(nodes: SkillNode[]): Promise<void> {
    await db.nodes.bulkPut(nodes);
  }

  async deleteNode(nodeId: string): Promise<void> {
    await db.nodes.delete(nodeId);
  }

  async addLog(entry: LogEntry): Promise<void> {
    await db.logs.put(entry);
  }

  async deleteLog(logId: string): Promise<void> {
    await db.logs.delete(logId);
  }

  async saveGoal(goal: Goal): Promise<void> {
    await db.goals.put(goal);
  }

  async deleteGoal(goalId: string): Promise<void> {
    await db.goals.delete(goalId);
  }

  async saveResource(resource: Resource): Promise<void> {
    await db.resources.put(resource);
  }

  async deleteResource(resourceId: string): Promise<void> {
    await db.resources.delete(resourceId);
  }

  async addAchievements(unlocks: AchievementUnlock[]): Promise<void> {
    await db.achievements.bulkPut(unlocks);
  }
}

/** The local, offline-capable backend. Always available. */
export const localRepository: LifeRpgRepository = new DexieRepository();

/**
 * The backend the app currently talks to. Swapped to the cloud implementation
 * on sign-in and back to local on sign-out; `repository` below delegates to it,
 * so no caller has to know which one is active.
 */
let active: LifeRpgRepository = localRepository;

export function setActiveRepository(next: LifeRpgRepository): void {
  active = next;
}

export function useLocalRepository(): void {
  active = localRepository;
}

export const repository: LifeRpgRepository = {
  loadAll: () => active.loadAll(),
  seed: (data) => active.seed(data),
  saveProfile: (profile) => active.saveProfile(profile),
  saveArea: (area) => active.saveArea(area),
  deleteArea: (areaId) => active.deleteArea(areaId),
  saveNode: (node) => active.saveNode(node),
  saveNodes: (nodes) => active.saveNodes(nodes),
  deleteNode: (nodeId) => active.deleteNode(nodeId),
  addLog: (entry) => active.addLog(entry),
  deleteLog: (logId) => active.deleteLog(logId),
  saveGoal: (goal) => active.saveGoal(goal),
  deleteGoal: (goalId) => active.deleteGoal(goalId),
  saveResource: (resource) => active.saveResource(resource),
  deleteResource: (resourceId) => active.deleteResource(resourceId),
  addAchievements: (unlocks) => active.addAchievements(unlocks),
};
