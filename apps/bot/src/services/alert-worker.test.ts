import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, schedules } from "@ff14kotei/db";
import { getDb, setDbForTesting, resetDb } from "../lib/db";
import {
  isDue,
  findDueSchedules,
  buildAlertMessage,
  tick,
  LATE_GRACE_MS,
} from "./alert-worker";

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
});

afterEach(() => {
  resetDb();
});

interface ScheduleInput {
  id: string;
  guildId: string;
  channelId: string;
  contentId?: string | null;
  phaseId?: string | null;
  startsAt: number;
  notifyMinutesBefore?: number;
  notifiedAt?: number | null;
  mention?: string | null;
  note?: string | null;
  createdAt: number;
  createdBy: string;
}

function insert(s: ScheduleInput): void {
  getDb().insert(schedules).values(s).run();
}

const NOW = 1_700_000_000_000;
const BASE = {
  id: "s",
  guildId: "g",
  channelId: "c",
  contentId: null,
  phaseId: null,
  startsAt: NOW,
  notifyMinutesBefore: 10,
  notifiedAt: null,
  mention: null,
  note: null,
  chouseisanUrl: null,
  staticId: null,
  createdAt: NOW,
  createdBy: "u",
};

describe("isDue", () => {
  it("is due when current time is within notify window", () => {
    expect(isDue({ ...BASE, startsAt: NOW + 5 * 60_000 }, NOW)).toBe(true);
  });

  it("is due at exactly alert time", () => {
    expect(isDue({ ...BASE, startsAt: NOW + 10 * 60_000 }, NOW)).toBe(true);
  });

  it("is NOT due before alert window", () => {
    expect(isDue({ ...BASE, startsAt: NOW + 60 * 60_000 }, NOW)).toBe(false);
  });

  it("is NOT due when already notified", () => {
    expect(isDue({ ...BASE, startsAt: NOW + 5 * 60_000, notifiedAt: NOW }, NOW)).toBe(false);
  });

  it("is due slightly past start (within grace)", () => {
    expect(isDue({ ...BASE, startsAt: NOW - 5 * 60_000 }, NOW)).toBe(true);
  });

  it("is NOT due beyond late grace", () => {
    expect(isDue({ ...BASE, startsAt: NOW - LATE_GRACE_MS - 1000 }, NOW)).toBe(false);
  });
});

describe("findDueSchedules", () => {
  it("returns only due-unnotified schedules", () => {
    insert({ id: "due", guildId: "g", channelId: "c", startsAt: NOW + 5 * 60_000, createdAt: NOW, createdBy: "u" });
    insert({ id: "future", guildId: "g", channelId: "c", startsAt: NOW + 60 * 60_000, createdAt: NOW, createdBy: "u" });
    insert({ id: "done", guildId: "g", channelId: "c", startsAt: NOW + 5 * 60_000, notifiedAt: NOW, createdAt: NOW, createdBy: "u" });

    const due = findDueSchedules(NOW).map((s) => s.id);
    expect(due).toContain("due");
    expect(due).not.toContain("future");
    expect(due).not.toContain("done");
  });
});

describe("buildAlertMessage", () => {
  it("includes minutes-before phrase and Discord timestamps", () => {
    const msg = buildAlertMessage(BASE);
    expect(msg).toContain("10分後");
    expect(msg).toContain(`<t:${NOW / 1000}:F>`);
    expect(msg).toContain(`<t:${NOW / 1000}:R>`);
  });

  it("prepends mention when set", () => {
    expect(buildAlertMessage({ ...BASE, mention: "<@&123>" }).startsWith("<@&123>")).toBe(true);
  });

  it("includes content/phase when set", () => {
    expect(buildAlertMessage({ ...BASE, contentId: "fru", phaseId: "p3" })).toContain("fru / p3");
  });

  it("includes note as quote", () => {
    expect(buildAlertMessage({ ...BASE, note: "P3練習" })).toContain("> P3練習");
  });

  it("includes chouseisanUrl when set", () => {
    const msg = buildAlertMessage({ ...BASE, chouseisanUrl: "https://chouseisan.com/s?h=abc" });
    expect(msg).toContain("📊");
    expect(msg).toContain("https://chouseisan.com/s?h=abc");
  });
});

describe("tick — end-to-end with mock client", () => {
  it("sends alert for due schedule and marks notified", async () => {
    insert({ id: "due", guildId: "g", channelId: "c1", startsAt: NOW + 5 * 60_000, createdAt: NOW, createdBy: "u" });

    const send = vi.fn().mockResolvedValue(undefined);
    const mockClient = {
      channels: { fetch: vi.fn().mockResolvedValue({ isTextBased: () => true, send }) },
    } as never;

    await tick(mockClient, NOW);

    expect(send).toHaveBeenCalledOnce();
    const updated = getDb().select().from(schedules).where(eq(schedules.id, "due")).get();
    expect(updated?.notifiedAt).toBe(NOW);
  });

  it("does not crash when channel fetch fails", async () => {
    insert({ id: "bad", guildId: "g", channelId: "missing", startsAt: NOW + 5 * 60_000, createdAt: NOW, createdBy: "u" });

    const mockClient = {
      channels: { fetch: vi.fn().mockRejectedValue(new Error("Unknown Channel")) },
    } as never;

    await expect(tick(mockClient, NOW)).resolves.toBeUndefined();
    const updated = getDb().select().from(schedules).where(eq(schedules.id, "bad")).get();
    expect(updated?.notifiedAt).toBeNull();
  });

  it("does nothing for future schedules", async () => {
    insert({ id: "future", guildId: "g", channelId: "c1", startsAt: NOW + 60 * 60_000, createdAt: NOW, createdBy: "u" });
    const send = vi.fn();
    const mockClient = {
      channels: { fetch: vi.fn().mockResolvedValue({ isTextBased: () => true, send }) },
    } as never;

    await tick(mockClient, NOW);
    expect(send).not.toHaveBeenCalled();
  });
});
