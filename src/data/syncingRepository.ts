import type {
  AchievementUnlock,
  AppData,
  Area,
  Goal,
  LogEntry,
  Note,
  Profile,
  Resource,
  SkillNode,
} from '../types/models';
import { db } from './db';
import { drainQueue, type QueuedWrite } from './outbox';
import type { LifeRpgRepository, LocalRepository } from './repository';

/**
 * Local-first repository for signed-in users.
 *
 * Reads and writes always hit the local database, so the app stays instant and
 * fully usable without a connection. Every write is additionally appended to an
 * outbox and replayed against the cloud in the background; if that fails the
 * entry simply stays queued until the next attempt.
 */
export class SyncingRepository implements LifeRpgRepository {
  /** The drain currently in flight, so concurrent callers can await it. */
  private running: Promise<void> | null = null;
  /** Notified whenever the number of pending writes changes. */
  private listeners = new Set<(pending: number) => void>();

  constructor(
    private readonly local: LocalRepository,
    private readonly cloud: LifeRpgRepository,
  ) {}

  // --- pending-count subscription -----------------------------------------

  onPendingChange(listener: (pending: number) => void): () => void {
    this.listeners.add(listener);
    void this.notify();
    return () => this.listeners.delete(listener);
  }

  private async notify(): Promise<void> {
    const pending = await db.outbox.count();
    this.listeners.forEach((listener) => listener(pending));
  }

  // --- queue --------------------------------------------------------------

  private async enqueue(op: string, args: unknown[]): Promise<void> {
    await db.outbox.add({ op, args, createdAt: new Date().toISOString() });
    await this.notify();
    // Fire and forget – the caller must not wait on the network.
    void this.flush();
  }

  /**
   * Replays queued writes against the cloud.
   *
   * Awaiting this means the queue was drained as far as it currently can be —
   * a concurrent call waits for the running drain and then runs once more, so
   * writes queued in the meantime are not left behind. Sign-in depends on that
   * guarantee before it pulls the cloud state over the local one.
   */
  async flush(): Promise<void> {
    if (this.running) await this.running.catch(() => undefined);

    this.running = this.drain();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  private async drain(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const items = await db.outbox.orderBy('seq').toArray();
    if (items.length === 0) return;

    const result = await drainQueue(items, (item) => this.applyToCloud(item));

    const flushedKeys = result.flushed
      .map((item) => item.seq)
      .filter((seq): seq is number => seq !== undefined);
    if (flushedKeys.length > 0) await db.outbox.bulkDelete(flushedKeys);

    await this.notify();
  }

  private applyToCloud(item: QueuedWrite): Promise<void> {
    const method = (this.cloud as unknown as Record<string, unknown>)[item.op];
    if (typeof method !== 'function') {
      // Unknown op (e.g. written by a newer version) – drop it rather than
      // wedging the queue forever.
      console.warn('Unbekannte Sync-Operation übersprungen:', item.op);
      return Promise.resolve();
    }
    return (method as (...args: unknown[]) => Promise<void>).apply(
      this.cloud,
      item.args,
    );
  }

  async pendingCount(): Promise<number> {
    return db.outbox.count();
  }

  // --- repository interface ------------------------------------------------

  loadAll(): Promise<AppData> {
    return this.local.loadAll();
  }

  async seed(data: AppData): Promise<void> {
    await this.local.seed(data);
    await this.enqueue('seed', [data]);
  }

  async saveProfile(profile: Profile): Promise<void> {
    await this.local.saveProfile(profile);
    await this.enqueue('saveProfile', [profile]);
  }

  async saveArea(area: Area): Promise<void> {
    await this.local.saveArea(area);
    await this.enqueue('saveArea', [area]);
  }

  async deleteArea(areaId: string): Promise<void> {
    await this.local.deleteArea(areaId);
    await this.enqueue('deleteArea', [areaId]);
  }

  async saveNode(node: SkillNode): Promise<void> {
    await this.local.saveNode(node);
    await this.enqueue('saveNode', [node]);
  }

  async saveNodes(nodes: SkillNode[]): Promise<void> {
    await this.local.saveNodes(nodes);
    await this.enqueue('saveNodes', [nodes]);
  }

  async deleteNode(nodeId: string): Promise<void> {
    await this.local.deleteNode(nodeId);
    await this.enqueue('deleteNode', [nodeId]);
  }

  async addLog(entry: LogEntry): Promise<void> {
    await this.local.addLog(entry);
    await this.enqueue('addLog', [entry]);
  }

  async deleteLog(logId: string): Promise<void> {
    await this.local.deleteLog(logId);
    await this.enqueue('deleteLog', [logId]);
  }

  async saveGoal(goal: Goal): Promise<void> {
    await this.local.saveGoal(goal);
    await this.enqueue('saveGoal', [goal]);
  }

  async deleteGoal(goalId: string): Promise<void> {
    await this.local.deleteGoal(goalId);
    await this.enqueue('deleteGoal', [goalId]);
  }

  async saveResource(resource: Resource): Promise<void> {
    await this.local.saveResource(resource);
    await this.enqueue('saveResource', [resource]);
  }

  async deleteResource(resourceId: string): Promise<void> {
    await this.local.deleteResource(resourceId);
    await this.enqueue('deleteResource', [resourceId]);
  }

  async saveJournalNote(note: Note): Promise<void> {
    await this.local.saveJournalNote(note);
    await this.enqueue('saveJournalNote', [note]);
  }

  async deleteJournalNote(noteId: string): Promise<void> {
    await this.local.deleteJournalNote(noteId);
    await this.enqueue('deleteJournalNote', [noteId]);
  }

  async addAchievements(unlocks: AchievementUnlock[]): Promise<void> {
    await this.local.addAchievements(unlocks);
    await this.enqueue('addAchievements', [unlocks]);
  }
}
