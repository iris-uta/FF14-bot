import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, votes } from "@ff14kotei/db";
import { getDb, setDbForTesting, resetDb } from "../lib/db";
import { createVote, parseCandidateInput, getVote } from "./vote";
import { findDueReminders, buildReminderMessage, tick } from "./vote-reminder";

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
});

afterEach(() => {
  resetDb();
});

const NOW = 1_700_000_000_000;
const HOUR_MS = 3_600_000;

function makeVote(opts: {
  id: string;
  closesAt: number | null;
  reminderHoursBefore: number | null;
  remindedAt?: number | null;
  closed?: boolean;
  messageId?: string;
  mention?: string;
}) {
  createVote({
    id: opts.id,
    guildId: "g",
    channelId: "c",
    creatorId: "u",
    title: `title-${opts.id}`,
    candidates: [parseCandidateInput("a", 0), parseCandidateInput("b", 1)],
    closesAt: opts.closesAt,
    reminderHoursBefore: opts.reminderHoursBefore,
    mention: opts.mention ?? null,
  });
  if (opts.remindedAt !== undefined) {
    getDb().update(votes).set({ remindedAt: opts.remindedAt }).where(eq(votes.id, opts.id)).run();
  }
  if (opts.closed) {
    getDb().update(votes).set({ closed: true }).where(eq(votes.id, opts.id)).run();
  }
  if (opts.messageId) {
    getDb().update(votes).set({ messageId: opts.messageId }).where(eq(votes.id, opts.id)).run();
  }
  return getVote(opts.id)!;
}

describe("findDueReminders", () => {
  it("returns votes where reminder time has passed and not yet reminded", () => {
    // closesAt 5h from now, reminderHoursBefore=6 → reminderAt = closesAt - 6h = -1h from now (past)
    makeVote({ id: "due", closesAt: NOW + 5 * HOUR_MS, reminderHoursBefore: 6 });
    const due = findDueReminders(NOW);
    expect(due.map((v) => v.id)).toEqual(["due"]);
  });

  it("excludes votes with no reminderHoursBefore", () => {
    makeVote({ id: "no-reminder", closesAt: NOW + HOUR_MS, reminderHoursBefore: null });
    expect(findDueReminders(NOW)).toEqual([]);
  });

  it("excludes already-reminded votes", () => {
    makeVote({
      id: "already",
      closesAt: NOW + 5 * HOUR_MS,
      reminderHoursBefore: 6,
      remindedAt: NOW - 60_000,
    });
    expect(findDueReminders(NOW)).toEqual([]);
  });

  it("excludes closed votes", () => {
    makeVote({
      id: "closed",
      closesAt: NOW + 5 * HOUR_MS,
      reminderHoursBefore: 6,
      closed: true,
    });
    expect(findDueReminders(NOW)).toEqual([]);
  });

  it("excludes votes where reminder time is still in the future", () => {
    // closesAt 10h from now, reminder 6h before → reminderAt = +4h from now (future)
    makeVote({ id: "future", closesAt: NOW + 10 * HOUR_MS, reminderHoursBefore: 6 });
    expect(findDueReminders(NOW)).toEqual([]);
  });
});

describe("buildReminderMessage", () => {
  it("includes title + relative time", () => {
    const v = makeVote({ id: "v", closesAt: NOW + HOUR_MS, reminderHoursBefore: 1 });
    const msg = buildReminderMessage(v);
    expect(msg).toContain("title-v");
    expect(msg).toContain(`<t:${Math.floor((NOW + HOUR_MS) / 1000)}:R>`);
  });

  it("prepends mention when set", () => {
    const v = makeVote({
      id: "v",
      closesAt: NOW + HOUR_MS,
      reminderHoursBefore: 1,
      mention: "<@&role-123>",
    });
    expect(buildReminderMessage(v).startsWith("<@&role-123>")).toBe(true);
  });
});

describe("tick — end-to-end", () => {
  it("sends reminder and marks remindedAt", async () => {
    makeVote({
      id: "v",
      closesAt: NOW + HOUR_MS,
      reminderHoursBefore: 2,
      messageId: "msg-1",
    });

    const send = vi.fn().mockResolvedValue(undefined);
    const mockClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue({ messages: {}, send }),
      },
    } as never;

    await tick(mockClient, NOW);

    expect(send).toHaveBeenCalledOnce();
    const after = getVote("v");
    expect(after?.remindedAt).toBe(NOW);
  });

  it("skips votes with no messageId (never posted)", async () => {
    makeVote({ id: "v", closesAt: NOW + HOUR_MS, reminderHoursBefore: 2 });
    // No messageId set

    const send = vi.fn();
    const mockClient = {
      channels: { fetch: vi.fn().mockResolvedValue({ messages: {}, send }) },
    } as never;

    await tick(mockClient, NOW);
    expect(send).not.toHaveBeenCalled();
    // remindedAt still updates so we don't re-process forever
    expect(getVote("v")?.remindedAt).toBe(NOW);
  });

  it("does not crash on channel fetch failure (leaves remindedAt null for retry)", async () => {
    makeVote({
      id: "v",
      closesAt: NOW + HOUR_MS,
      reminderHoursBefore: 2,
      messageId: "msg",
    });
    const mockClient = {
      channels: { fetch: vi.fn().mockRejectedValue(new Error("Unknown Channel")) },
    } as never;

    await expect(tick(mockClient, NOW)).resolves.toBeUndefined();
    // Not marked as reminded — next tick can retry
    expect(getVote("v")?.remindedAt).toBeNull();
  });
});
