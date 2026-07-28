import Dexie, { type Table } from 'dexie';
import type {
  Area,
  Goal,
  LogEntry,
  Profile,
  Resource,
  SkillNode,
} from '../types/models';

/** IndexedDB schema. Kept internal – the app talks to the repository instead. */
export class LifeRpgDatabase extends Dexie {
  profiles!: Table<Profile, string>;
  areas!: Table<Area, string>;
  nodes!: Table<SkillNode, string>;
  logs!: Table<LogEntry, string>;
  goals!: Table<Goal, string>;
  resources!: Table<Resource, string>;

  constructor() {
    super('life-rpg');
    this.version(1).stores({
      profiles: 'id',
      areas: 'id, sortOrder',
      nodes: 'id, areaId',
      logs: 'id, areaId, timestamp',
      goals: 'id, areaId',
      resources: 'id, areaId',
    });
  }
}

export const db = new LifeRpgDatabase();
