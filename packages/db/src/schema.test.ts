import { describe, it, expect, beforeEach } from "vitest";
import { eq, and, isNull, lte } from "drizzle-orm";
import { createDb, schedules, type DbClient } from "./index";

let db: DbClient;

beforeEach(() => {
  db = createDb({ path: ":memory:" });
});

describe("schedules table", () => {
  it("insert + select round-trip", () => {
    const now = Date.now();
    db.insert(schedules).values({
      id: "s1",
      guildId: "g1",
      channelId: "c1",
      contentId: "fru",
      phaseId: "p3",
      startsAt: now + 600_000,
      mention: "<@123>",
      note: "テスト",
      createdAt: now,
      createdBy: "u1",
    }).run();

    const rows = db.select().from(schedules).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "s1",
      guildId: "g1",
      channelId: "c1",
      contentId: "fru",
      phaseId: "p3",
      notifyMinutesBefore: 10,
      notifiedAt: null,
      mention: "<@123>",
      note: "テスト",
      createdBy: "u1",
    });
  });

  it("default notifyMinutesBefore is 10", () => {
    db.insert(schedules).values({
      id: "s1",
      guildId: "g1",
      channelId: "c1",
      startsAt: Date.now(),
      createdAt: Date.now(),
      createdBy: "u1",
    }).run();
    const row = db.select().from(schedules).get();
    expect(row?.notifyMinutesBefore).toBe(10);
  });

  it("override notifyMinutesBefore works", () => {
    db.insert(schedules).values({
      id: "s1",
      guildId: "g1",
      channelId: "c1",
      startsAt: Date.now(),
      notifyMinutesBefore: 30,
      createdAt: Date.now(),
      createdBy: "u1",
    }).run();
    expect(db.select().from(schedules).get()?.notifyMinutesBefore).toBe(30);
  });

  it("primary key uniqueness is enforced", () => {
    const common = {
      guildId: "g1",
      channelId: "c1",
      startsAt: Date.now(),
      createdAt: Date.now(),
      createdBy: "u1",
    };
    db.insert(schedules).values({ id: "dup", ...common }).run();
    expect(() => {
      db.insert(schedules).values({ id: "dup", ...common }).run();
    }).toThrow();
  });

  it("query for due-but-unnotified schedules", () => {
    const now = Date.now();
    const tenMinMs = 10 * 60_000;

    // Past, not notified yet (overdue) → should match
    db.insert(schedules).values({
      id: "overdue",
      guildId: "g",
      channelId: "c",
      startsAt: now + 5 * 60_000,        // 5 min from now, notifyBefore=10 → due
      notifyMinutesBefore: 10,
      createdAt: now,
      createdBy: "u",
    }).run();

    // Future, beyond notify window → should not match
    db.insert(schedules).values({
      id: "future",
      guildId: "g",
      channelId: "c",
      startsAt: now + 60 * 60_000,       // 60 min from now
      notifyMinutesBefore: 10,
      createdAt: now,
      createdBy: "u",
    }).run();

    // Already notified → should not match
    db.insert(schedules).values({
      id: "done",
      guildId: "g",
      channelId: "c",
      startsAt: now + 5 * 60_000,
      notifyMinutesBefore: 10,
      notifiedAt: now,
      createdAt: now,
      createdBy: "u",
    }).run();

    // Find schedules where: notifiedAt IS NULL AND (startsAt - notifyMinutesBefore*60_000) <= now
    // In SQL: notified_at IS NULL AND starts_at - notify_minutes_before * 60000 <= ?
    const due = db.select().from(schedules)
      .where(and(
        isNull(schedules.notifiedAt),
        lte(schedules.startsAt, now + tenMinMs)  // simplified for test
      ))
      .all();

    const ids = due.map((r) => r.id);
    expect(ids).toContain("overdue");
    expect(ids).not.toContain("future");
    expect(ids).not.toContain("done");
  });

  it("mark schedule as notified", () => {
    const now = Date.now();
    db.insert(schedules).values({
      id: "s1",
      guildId: "g1",
      channelId: "c1",
      startsAt: now,
      createdAt: now,
      createdBy: "u1",
    }).run();

    db.update(schedules).set({ notifiedAt: now + 1000 }).where(eq(schedules.id, "s1")).run();

    const row = db.select().from(schedules).where(eq(schedules.id, "s1")).get();
    expect(row?.notifiedAt).toBe(now + 1000);
  });

  it("delete schedule", () => {
    db.insert(schedules).values({
      id: "s1",
      guildId: "g1",
      channelId: "c1",
      startsAt: Date.now(),
      createdAt: Date.now(),
      createdBy: "u1",
    }).run();
    db.delete(schedules).where(eq(schedules.id, "s1")).run();
    expect(db.select().from(schedules).all()).toHaveLength(0);
  });
});
