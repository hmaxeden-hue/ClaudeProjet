import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { localRepository, type LifeRpgRepository } from './repository';
import { SyncingRepository } from './syncingRepository';
import type { LogEntry } from '../types/models';

function makeCloud() {
  return {
    loadAll: vi.fn(),
    seed: vi.fn().mockResolvedValue(undefined),
    saveProfile: vi.fn().mockResolvedValue(undefined),
    saveArea: vi.fn().mockResolvedValue(undefined),
    deleteArea: vi.fn().mockResolvedValue(undefined),
    saveNode: vi.fn().mockResolvedValue(undefined),
    saveNodes: vi.fn().mockResolvedValue(undefined),
    deleteNode: vi.fn().mockResolvedValue(undefined),
    addLog: vi.fn().mockResolvedValue(undefined),
    deleteLog: vi.fn().mockResolvedValue(undefined),
    saveGoal: vi.fn().mockResolvedValue(undefined),
    deleteGoal: vi.fn().mockResolvedValue(undefined),
    saveResource: vi.fn().mockResolvedValue(undefined),
    deleteResource: vi.fn().mockResolvedValue(undefined),
    addAchievements: vi.fn().mockResolvedValue(undefined),
  };
}

const log = (id: string): LogEntry => ({
  id,
  areaId: 'area-1',
  description: `Aktivität ${id}`,
  xp: 10,
  timestamp: new Date().toISOString(),
});

/** Lets the fire-and-forget flush kicked off by a write settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('SyncingRepository', () => {
  beforeEach(async () => {
    if (db.isOpen()) db.close();
    await db.delete();
    await db.open();
  });

  it('writes locally and forwards to the cloud when online', async () => {
    const cloud = makeCloud();
    const sync = new SyncingRepository(
      localRepository,
      cloud as unknown as LifeRpgRepository,
    );

    await sync.addLog(log('a'));
    await settle();

    const local = await localRepository.loadAll();
    expect(local.logs.map((l) => l.id)).toEqual(['a']);
    expect(cloud.addLog).toHaveBeenCalledTimes(1);
    expect(await sync.pendingCount()).toBe(0);
  });

  it('keeps the write locally and queues it when the cloud is unreachable', async () => {
    const cloud = makeCloud();
    cloud.addLog.mockRejectedValue(new Error('offline'));
    const sync = new SyncingRepository(
      localRepository,
      cloud as unknown as LifeRpgRepository,
    );

    await sync.addLog(log('a'));
    await settle();

    // The user's data is safe locally even though the upload failed.
    const local = await localRepository.loadAll();
    expect(local.logs.map((l) => l.id)).toEqual(['a']);
    expect(await sync.pendingCount()).toBe(1);
  });

  it('sends everything queued once the connection is back, in order', async () => {
    const cloud = makeCloud();
    cloud.addLog.mockRejectedValue(new Error('offline'));
    const sync = new SyncingRepository(
      localRepository,
      cloud as unknown as LifeRpgRepository,
    );

    await sync.addLog(log('a'));
    await sync.addLog(log('b'));
    await sync.addLog(log('c'));
    await settle();
    expect(await sync.pendingCount()).toBe(3);

    cloud.addLog.mockReset();
    cloud.addLog.mockResolvedValue(undefined);
    await sync.flush();

    expect(await sync.pendingCount()).toBe(0);
    expect(cloud.addLog.mock.calls.map((call) => (call[0] as LogEntry).id)).toEqual(
      ['a', 'b', 'c'],
    );
  });

  it('does not lose later writes when one in the middle fails', async () => {
    const cloud = makeCloud();
    const sync = new SyncingRepository(
      localRepository,
      cloud as unknown as LifeRpgRepository,
    );

    cloud.addLog.mockRejectedValue(new Error('offline'));
    await sync.addLog(log('a'));
    await sync.addLog(log('b'));
    await settle();

    // Only the first upload succeeds on the next attempt.
    cloud.addLog.mockReset();
    cloud.addLog
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('offline again'));
    await sync.flush();

    expect(await sync.pendingCount()).toBe(1);

    cloud.addLog.mockReset();
    cloud.addLog.mockResolvedValue(undefined);
    await sync.flush();

    expect(await sync.pendingCount()).toBe(0);
    expect((cloud.addLog.mock.calls[0][0] as LogEntry).id).toBe('b');
  });

  it('reports the pending count to subscribers', async () => {
    const cloud = makeCloud();
    cloud.addLog.mockRejectedValue(new Error('offline'));
    const sync = new SyncingRepository(
      localRepository,
      cloud as unknown as LifeRpgRepository,
    );

    const seen: number[] = [];
    sync.onPendingChange((count) => seen.push(count));

    await sync.addLog(log('a'));
    await settle();

    expect(seen[seen.length - 1]).toBe(1);
  });
});
