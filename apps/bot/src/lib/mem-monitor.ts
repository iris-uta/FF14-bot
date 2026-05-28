/**
 * Periodic memory usage logging.
 *
 * On a 256 MB Fly machine the kernel OOM-killer wakes up at ~240 MB resident.
 * We log every 5 min at INFO level and bark at WARN if RSS crosses 200 MB so
 * we have a heads-up before the bot dies silently.
 *
 * Logs go to stdout → visible in `fly logs`.
 */

const TICK_INTERVAL_MS = 5 * 60_000;
const WARN_THRESHOLD_MB = 200;

let timer: NodeJS.Timeout | undefined;

function formatBytes(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function snapshot(): string {
  const m = process.memoryUsage();
  return [
    `rss=${formatBytes(m.rss)}`,
    `heap=${formatBytes(m.heapUsed)}/${formatBytes(m.heapTotal)}`,
    `ext=${formatBytes(m.external)}`,
    `arr=${formatBytes(m.arrayBuffers)}`,
  ].join(" ");
}

export function startMemMonitor(): void {
  // Log once at startup so we have a baseline before any guild caches fill.
  console.log(`[mem] startup ${snapshot()}`);

  timer = setInterval(() => {
    const m = process.memoryUsage();
    const rssMb = m.rss / 1024 / 1024;
    if (rssMb >= WARN_THRESHOLD_MB) {
      console.warn(
        `[mem] HIGH ${snapshot()} — approaching 256MB OOM threshold, consider bumping VM size`
      );
    } else {
      console.log(`[mem] ${snapshot()}`);
    }
  }, TICK_INTERVAL_MS);

  // Don't block process exit on this timer.
  if (timer.unref) timer.unref();
}

export function stopMemMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
