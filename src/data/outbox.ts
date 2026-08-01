/**
 * Queue semantics for writes that still have to reach the cloud.
 *
 * Kept free of storage and network concerns so the ordering rules can be
 * tested directly – this is the piece where a mistake silently loses data.
 */

export interface QueuedWrite {
  seq?: number;
  /** Name of the repository method to replay. */
  op: string;
  args: unknown[];
  createdAt: string;
}

export interface DrainResult {
  /** Writes that reached the cloud, in order. */
  flushed: QueuedWrite[];
  /** Writes still pending – the failed one first, then everything after it. */
  remaining: QueuedWrite[];
  /** Set when the drain stopped early. */
  error?: unknown;
}

/**
 * Replays queued writes in insertion order and stops at the first failure.
 *
 * Stopping matters: the queue is an ordered log, so skipping a failed write
 * and continuing could apply a later edit of the same record before an earlier
 * one — and a delete before its create. Everything from the failure onwards
 * stays queued for the next attempt.
 */
export async function drainQueue(
  items: QueuedWrite[],
  apply: (item: QueuedWrite) => Promise<void>,
): Promise<DrainResult> {
  const flushed: QueuedWrite[] = [];

  for (let i = 0; i < items.length; i++) {
    try {
      await apply(items[i]);
      flushed.push(items[i]);
    } catch (error) {
      return { flushed, remaining: items.slice(i), error };
    }
  }

  return { flushed, remaining: [] };
}
