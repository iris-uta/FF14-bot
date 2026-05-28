import { describe, it, expect, vi } from "vitest";
import { makeSafeTick, waitForAllWithTimeout } from "./safe-tick";

const tinyDelay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("makeSafeTick", () => {
  it("runs the tick function when nothing is in-flight", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const r = makeSafeTick("test", fn);
    await r.run();
    expect(fn).toHaveBeenCalledOnce();
  });

  it("skips overlapping ticks while one is in flight", async () => {
    let resolveSlow: () => void;
    const slow = new Promise<void>((resolve) => { resolveSlow = resolve; });
    const fn = vi.fn().mockImplementation(() => slow);
    const r = makeSafeTick("overlap", fn);

    // Start one tick (will block on `slow`)
    const first = r.run();
    // Try to start another — should be a no-op
    await r.run();
    expect(fn).toHaveBeenCalledOnce();
    // Release and let the first complete
    resolveSlow!();
    await first;
    // Now a new tick can run
    await r.run();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("releases the in-flight slot even when tick throws", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom"));
    const r = makeSafeTick("err", fn);
    // First tick rejects — but the run() Promise rejects so caller can decide
    await expect(r.run()).rejects.toThrow("boom");
    // Slot must be released; next tick should run
    fn.mockResolvedValueOnce(undefined);
    await r.run();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("waitForCurrentTick resolves immediately when nothing is in flight", async () => {
    const r = makeSafeTick("idle", async () => {});
    // Should resolve quickly
    const start = Date.now();
    await r.waitForCurrentTick();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("waitForCurrentTick waits for an in-flight tick to complete", async () => {
    let resolveSlow: () => void;
    const slow = new Promise<void>((resolve) => { resolveSlow = resolve; });
    const r = makeSafeTick("wait", () => slow);

    void r.run();
    let waitDone = false;
    const waiter = r.waitForCurrentTick().then(() => { waitDone = true; });

    await tinyDelay(30);
    expect(waitDone).toBe(false);  // tick still running

    resolveSlow!();
    await waiter;
    expect(waitDone).toBe(true);
  });

  it("waitForCurrentTick swallows a rejection of the in-flight tick", async () => {
    let rejectSlow: (err: Error) => void;
    const slow = new Promise<void>((_, reject) => { rejectSlow = reject; });
    const r = makeSafeTick("reject", () => slow);

    const tickPromise = r.run();
    const waiter = r.waitForCurrentTick();

    rejectSlow!(new Error("tick failed"));
    // run() should reject, but waitForCurrentTick should NOT
    await expect(tickPromise).rejects.toThrow("tick failed");
    await expect(waiter).resolves.toBeUndefined();
  });
});

describe("waitForAllWithTimeout", () => {
  it("returns drained=true when all runners finish before timeout", async () => {
    const r1 = makeSafeTick("a", async () => { await tinyDelay(10); });
    const r2 = makeSafeTick("b", async () => { await tinyDelay(10); });
    void r1.run();
    void r2.run();
    const result = await waitForAllWithTimeout([r1, r2], 500);
    expect(result.drained).toBe(true);
  });

  it("returns drained=false when a runner exceeds the timeout", async () => {
    let resolveSlow: () => void;
    const slow = new Promise<void>((resolve) => { resolveSlow = resolve; });
    const r = makeSafeTick("slow", () => slow);
    void r.run();
    const result = await waitForAllWithTimeout([r], 50);
    expect(result.drained).toBe(false);
    // Cleanup so vitest doesn't complain about pending promises
    resolveSlow!();
  });

  it("returns drained=true immediately when no runners are busy", async () => {
    const r1 = makeSafeTick("idle1", async () => {});
    const r2 = makeSafeTick("idle2", async () => {});
    const start = Date.now();
    const result = await waitForAllWithTimeout([r1, r2], 5000);
    expect(result.drained).toBe(true);
    expect(Date.now() - start).toBeLessThan(50);
  });
});
