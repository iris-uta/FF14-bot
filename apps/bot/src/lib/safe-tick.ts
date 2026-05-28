/**
 * Worker tick safety helper — used by alert-worker, vote-closer, vote-reminder.
 *
 * Solves 2 problems flagged by audit:
 *
 * B2 (overlap guard):
 *   setInterval fires at fixed intervals; if a tick takes > interval (slow DB,
 *   Discord rate limit), we'd get overlapping ticks racing on the same rows.
 *   Skip when a tick is already in flight.
 *
 * B3 (graceful shutdown):
 *   SIGTERM needs to wait for any in-flight tick to finish so partial DB writes
 *   are committed before the process exits. Provides waitForCurrentTick().
 */
export interface SafeTickRunner {
  /** Schedule a tick. Skipped if one is already running. */
  run: () => Promise<void>;
  /** Resolves when the in-flight tick (if any) completes. */
  waitForCurrentTick: () => Promise<void>;
}

export function makeSafeTick(
  name: string,
  tickFn: () => Promise<void>
): SafeTickRunner {
  let inflight: Promise<void> | null = null;
  let skippedSinceLastLog = 0;

  return {
    run: async () => {
      if (inflight) {
        skippedSinceLastLog++;
        // Log every 5th skip so a slow tick is visible without spamming
        if (skippedSinceLastLog % 5 === 1) {
          console.warn(
            `[${name}] tick skipped — previous still running (${skippedSinceLastLog} consecutive skips)`
          );
        }
        return;
      }
      skippedSinceLastLog = 0;
      inflight = (async () => {
        try {
          await tickFn();
        } finally {
          inflight = null;
        }
      })();
      await inflight;
    },
    waitForCurrentTick: async () => {
      if (inflight) {
        await inflight.catch(() => {}); // swallow — we just want to wait
      }
    },
  };
}

/**
 * Wait for multiple worker runners to drain. Used by SIGTERM handler.
 * Includes a hard timeout so a stuck tick doesn't block shutdown forever.
 */
export async function waitForAllWithTimeout(
  runners: SafeTickRunner[],
  timeoutMs: number = 10_000
): Promise<{ drained: boolean }> {
  const drain = Promise.all(runners.map((r) => r.waitForCurrentTick()));
  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), timeoutMs)
  );
  const result = await Promise.race([drain.then(() => "drained" as const), timeout]);
  return { drained: result === "drained" };
}
