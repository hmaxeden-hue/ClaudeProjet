import { describe, expect, it, vi } from 'vitest';
import { drainQueue, type QueuedWrite } from './outbox';

const write = (op: string): QueuedWrite => ({
  op,
  args: [],
  createdAt: new Date().toISOString(),
});

describe('drainQueue', () => {
  it('replays every write in insertion order', async () => {
    const seen: string[] = [];
    const items = [write('a'), write('b'), write('c')];

    const result = await drainQueue(items, async (item) => {
      seen.push(item.op);
    });

    expect(seen).toEqual(['a', 'b', 'c']);
    expect(result.flushed).toHaveLength(3);
    expect(result.remaining).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('stops at the first failure and keeps the rest queued', async () => {
    const items = [write('a'), write('b'), write('c')];
    const apply = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);

    const result = await drainQueue(items, apply);

    // 'c' must not be applied before 'b' succeeds – order is the point.
    expect(apply).toHaveBeenCalledTimes(2);
    expect(result.flushed.map((w) => w.op)).toEqual(['a']);
    expect(result.remaining.map((w) => w.op)).toEqual(['b', 'c']);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('is a no-op for an empty queue', async () => {
    const apply = vi.fn();
    const result = await drainQueue([], apply);

    expect(apply).not.toHaveBeenCalled();
    expect(result.flushed).toEqual([]);
    expect(result.remaining).toEqual([]);
  });

  it('leaves the whole queue pending when the very first write fails', async () => {
    const items = [write('a'), write('b')];

    const result = await drainQueue(items, async () => {
      throw new Error('offline');
    });

    expect(result.flushed).toEqual([]);
    expect(result.remaining.map((w) => w.op)).toEqual(['a', 'b']);
  });
});
