import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Client } from "discord.js";
import { startHealthServer, stopHealthServer, type HealthState } from "./health-server";

// Minimal mock that satisfies what health-server reads.
function mockClient(guildCount = 0): Client {
  return {
    guilds: { cache: { size: guildCount } },
  } as unknown as Client;
}

const TEST_PORT = 18080; // unlikely to collide with anything

async function fetchHealth(): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

describe("startHealthServer", () => {
  let state: HealthState;

  beforeEach(() => {
    state = { ready: false };
  });

  afterEach(async () => {
    await stopHealthServer();
  });

  it("returns 503 with status=starting while not ready", async () => {
    startHealthServer(mockClient(), state, TEST_PORT);
    const { status, body } = await fetchHealth();
    expect(status).toBe(503);
    expect(body.status).toBe("starting");
    expect(body.ready).toBe(false);
    expect(body.guilds).toBe(0);
  });

  it("returns 200 with status=ok + guild count once ready=true", async () => {
    startHealthServer(mockClient(3), state, TEST_PORT);
    state.ready = true;  // simulate ClientReady firing
    const { status, body } = await fetchHealth();
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.ready).toBe(true);
    expect(body.guilds).toBe(3);
    expect(typeof body.uptime_seconds).toBe("number");
  });

  it("returns 404 for non-/health paths", async () => {
    startHealthServer(mockClient(), state, TEST_PORT);
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/random`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-GET methods", async () => {
    startHealthServer(mockClient(), state, TEST_PORT);
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("exposes GIT_SHA from env in the version field", async () => {
    const prevSha = process.env.GIT_SHA;
    process.env.GIT_SHA = "test-sha-abc1234";
    try {
      startHealthServer(mockClient(), state, TEST_PORT);
      const { body } = await fetchHealth();
      expect(body.version).toBe("test-sha-abc1234");
    } finally {
      if (prevSha === undefined) delete process.env.GIT_SHA;
      else process.env.GIT_SHA = prevSha;
    }
  });
});
