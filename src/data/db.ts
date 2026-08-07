import Dexie, { type Table } from 'dexie';
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

/** IndexedDB schema. Kept internal – the app talks to the repository instead. */
export class LifeRpgDatabase extends Dexie {
  profiles!: Table<Profile, string>;
  areas!: Table<Area, string>;
  nodes!: Table<SkillNode, string>;
  logs!: Table<LogEntry, string>;
  goals!: Table<Goal, string>;
  resources!: Table<Resource, string>;
  notes!: Table<Note, string>;
  achievements!: Table<AchievementUnlock, string>;
  outbox!: Table<OutboxEntry, number>;

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
    // v2 adds badges; existing tables are carried over unchanged.
    this.version(2).stores({
      achievements: 'id',
    });
    // v3 adds the outbox that lets writes survive being offline.
    this.version(3).stores({
      outbox: '++seq',
    });
    // v4 adds journal notes, indexed by node and by time for the day grouping.
    this.version(4).stores({
      notes: 'id, nodeId, createdAt',
    });
  }
}

/** A write that still has to reach the cloud, replayed in insertion order. */
export interface OutboxEntry {
  seq?: number;
  op: string;
  args: unknown[];
  createdAt: string;
}

export const db = new LifeRpgDatabase();
