import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, votes } from "@ff14kotei/db";
import { getDb, setDbForTesting, resetDb } from "../lib/db";
import {
  createVote,
  recordResponse,
  parseCandidateInput,
  getVote,
} from "./vote";
import { findDueVotes, autoCloseVote, buildResultDm, tick } from "./vote-closer";

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
});

afterEach(() => {
  resetDb();
});

const NOW = 1_700_000_000_000;

function makeVote(overrides: Partial<{ id: string; closesAt: number | null; closed: boolean }> = {}) {
  const id = overrides.id ?? "v";
  // Distinguish "key not provided" from "key explicitly null" — `??` would coerce both.
  const closesAt = "closesAt" in overrides ? overrides.closesAt : NOW - 1_000;
  createVote({
    id,
    guildId: "g",
    channelId: "c",
    creatorId: "u-creator",
    title: "次回固定日",
    candidates: [parseCandidateInput("a", 0), parseCandidateInput("b", 1)],
    closesAt,
  });
  if (overrides.closed) {
    getDb().update(votes).set({ closed: true }).where(eq(votes.id, id)).run();
  }
  return getVote(id)!;
}

describe("findDueVotes", () => {
  it("returns open votes whose closesAt has passed", () => {
    makeVote({ id: "due", closesAt: NOW - 1_000 });
    const due = findDueVotes(NOW);
    expect(due.map((v) => v.id)).toEqual(["due"]);
  });

  it("excludes votes without closesAt", () => {
    makeVote({ id: "no-deadline", closesAt: null });
    expect(findDueVotes(NOW)).toEqual([]);
  });

  it("excludes votes whose closesAt is in the future", () => {
    makeVote({ id: "future", closesAt: NOW + 60_000 });
    expect(findDueVotes(NOW)).toEqual([]);
  });

  it("excludes already-closed votes", () => {
    makeVote({ id: "already", closesAt: NOW - 60_000, closed: true });
    expect(findDueVotes(NOW)).toEqual([]);
  });

  it("returns multiple due votes in one call", () => {
    makeVote({ id: "due1", closesAt: NOW - 10_000 });
    makeVote({ id: "due2", closesAt: NOW - 5_000 });
    makeVote({ id: "future", closesAt: NOW + 5_000 });
    const due = findDueVotes(NOW);
    expect(due.map((v) => v.id).sort()).toEqual(["due1", "due2"]);
  });
});

describe("autoCloseVote", () => {
  it("marks the vote closed and edits the message", async () => {
    const vote = makeVote({ id: "v1" });
    // Pretend the vote was already posted (set messageId)
    getDb().update(votes).set({ messageId: "msg-1" }).where(eq(votes.id, "v1")).run();

    const edit = vi.fn().mockResolvedValue(undefined);
    const userSend = vi.fn().mockResolvedValue(undefined);
    const mockClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          messages: { fetch: vi.fn().mockResolvedValue({ edit }) },
        }),
      },
      users: { fetch: vi.fn().mockResolvedValue({ send: userSend }) },
    } as never;

    await autoCloseVote(mockClient, { ...vote, messageId: "msg-1" });

    const after = getVote("v1");
    expect(after?.closed).toBe(true);
    expect(edit).toHaveBeenCalledOnce();
    expect(userSend).toHaveBeenCalledOnce();
  });

  it("still closes the vote when DM fails", async () => {
    const vote = makeVote({ id: "v2" });
    getDb().update(votes).set({ messageId: "msg-2" }).where(eq(votes.id, "v2")).run();

    const edit = vi.fn().mockResolvedValue(undefined);
    const mockClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          messages: { fetch: vi.fn().mockResolvedValue({ edit }) },
        }),
      },
      users: { fetch: vi.fn().mockRejectedValue(new Error("DMs disabled")) },
    } as never;

    await autoCloseVote(mockClient, { ...vote, messageId: "msg-2" });
    expect(getVote("v2")?.closed).toBe(true);
  });

  it("still closes the vote when message fetch fails", async () => {
    const vote = makeVote({ id: "v3" });
    getDb().update(votes).set({ messageId: "missing-msg" }).where(eq(votes.id, "v3")).run();

    const mockClient = {
      channels: { fetch: vi.fn().mockRejectedValue(new Error("Unknown Channel")) },
      users: { fetch: vi.fn().mockResolvedValue({ send: vi.fn().mockResolvedValue(undefined) }) },
    } as never;

    await autoCloseVote(mockClient, { ...vote, messageId: "missing-msg" });
    expect(getVote("v3")?.closed).toBe(true);
  });

  it("skips message edit when messageId is null (vote was never posted)", async () => {
    const vote = makeVote({ id: "v4" });
    // messageId remains null
    const edit = vi.fn();
    const channelsFetch = vi.fn();
    const mockClient = {
      channels: { fetch: channelsFetch },
      users: { fetch: vi.fn().mockResolvedValue({ send: vi.fn().mockResolvedValue(undefined) }) },
    } as never;

    await autoCloseVote(mockClient, vote);
    expect(channelsFetch).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
    expect(getVote("v4")?.closed).toBe(true);
  });
});

describe("buildResultDm", () => {
  it("sorts candidates by yes-count desc and uses medal emojis", () => {
    const vote = makeVote({ id: "v" });
    // Candidate 1 (index 1) gets more yes than candidate 0
    recordResponse("v", "u1", 0, "yes");
    recordResponse("v", "u1", 1, "yes");
    recordResponse("v", "u2", 1, "yes");
    recordResponse("v", "u3", 1, "yes");

    const dm = buildResultDm(vote);
    const idx0 = dm.indexOf("1. a");
    const idx1 = dm.indexOf("2. b");
    expect(idx1).toBeLessThan(idx0); // winner shows up first
    expect(dm).toContain("🥇");
    expect(dm).toContain("🥈");
  });

  it("includes counts and mentions for yes-voters", () => {
    const vote = makeVote({ id: "v" });
    recordResponse("v", "u-alice", 0, "yes");
    recordResponse("v", "u-bob", 0, "no");
    recordResponse("v", "u-carol", 0, "maybe");

    const dm = buildResultDm(vote);
    expect(dm).toContain("⭕ 1");
    expect(dm).toContain("❌ 1");
    expect(dm).toContain("🤔 1");
    expect(dm).toContain("<@u-alice>");
  });

  it("caps yes voter list at 15 with overflow indicator", () => {
    const vote = makeVote({ id: "v" });
    for (let i = 0; i < 20; i++) {
      recordResponse("v", `u${i}`, 0, "yes");
    }
    const dm = buildResultDm(vote);
    expect(dm).toContain("+5");
  });
});

describe("tick — end-to-end", () => {
  it("closes only the due vote, leaves others open", async () => {
    makeVote({ id: "due", closesAt: NOW - 1 });
    makeVote({ id: "future", closesAt: NOW + 60_000 });
    makeVote({ id: "no-deadline", closesAt: null });

    const mockClient = {
      channels: { fetch: vi.fn().mockRejectedValue(new Error("no msg posted")) },
      users: { fetch: vi.fn().mockResolvedValue({ send: vi.fn().mockResolvedValue(undefined) }) },
    } as never;

    await tick(mockClient, NOW);

    expect(getVote("due")?.closed).toBe(true);
    expect(getVote("future")?.closed).toBe(false);
    expect(getVote("no-deadline")?.closed).toBe(false);
  });

  it("does not crash when all operations fail", async () => {
    makeVote({ id: "due", closesAt: NOW - 1 });
    const mockClient = {
      channels: { fetch: vi.fn().mockRejectedValue(new Error("x")) },
      users: { fetch: vi.fn().mockRejectedValue(new Error("y")) },
    } as never;
    await expect(tick(mockClient, NOW)).resolves.toBeUndefined();
    // The vote is still closed in DB because closeVote runs first.
    expect(getVote("due")?.closed).toBe(true);
  });
});
