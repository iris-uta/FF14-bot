import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, recurringSchedules, schedules } from "@ff14kotei/db";
import { getDb, setDbForTesting, resetDb } from "../lib/db";
import {
  computeNextOccurrence,
  scheduleNextOccurrence,
  createRule,
  listActiveRules,
  listRulesInGuild,
  getRule,
  deleteRule,
  formatRuleSchedule,
  tick,
  WEEKDAY_LABELS,
  DEDUP_WINDOW_MS,
} from "./recurring-scheduler";

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
});

afterEach(() => {
  resetDb();
});

const JST_OFFSET_MS = 9 * 60 * 60_000;

/** Convenience: build a "next Friday 21:00 JST" anchor for testing. */
function makeRule(overrides: Partial<typeof recurringSchedules.$inferInsert> = {}) {
  const values = {
    id: "r-default",
    guildId: "g1",
    channelId: "c1",
    weekday: 5,            // Friday
    hourJst: 21,
    minuteJst: 0,
    notifyMinutesBefore: 10,
    active: true,
    createdAt: Date.now(),
    createdBy: "u-creator",
    ...overrides,
  };
  return createRule(values);
}

describe("computeNextOccurrence", () => {
  it("returns the same weekday at hh:mm JST (future occurrence)", () => {
    // Anchor: Sunday 2026-01-04 00:00 JST = Saturday 2026-01-03 15:00 UTC
    const sundayMidnightJst = Date.UTC(2026, 0, 3, 15, 0); // Sat 15:00 UTC = Sun 00:00 JST
    // Target: Friday 21:00 (weekday=5). Days ahead from Sunday = 5.
    const occurrence = computeNextOccurrence(5, 21, 0, sundayMidnightJst);
    // Expected: 2026-01-09 21:00 JST = 2026-01-09 12:00 UTC
    expect(occurrence).toBe(Date.UTC(2026, 0, 9, 12, 0));
  });

  it("returns 'today' when current time is before target time", () => {
    // Friday 10:00 JST = Friday 01:00 UTC
    const fridayMorningJst = Date.UTC(2026, 0, 9, 1, 0);
    const occurrence = computeNextOccurrence(5, 21, 0, fridayMorningJst); // same day 21:00
    expect(occurrence).toBe(Date.UTC(2026, 0, 9, 12, 0));
  });

  it("rolls over to next week when target time has already passed today", () => {
    // Friday 22:00 JST (past 21:00) = Friday 13:00 UTC
    const fridayLateJst = Date.UTC(2026, 0, 9, 13, 0);
    const occurrence = computeNextOccurrence(5, 21, 0, fridayLateJst);
    // Next Friday: 2026-01-16 21:00 JST = 12:00 UTC
    expect(occurrence).toBe(Date.UTC(2026, 0, 16, 12, 0));
  });

  it("treats weekday 0 as Sunday (JST)", () => {
    // Anchor: Monday 2026-01-05 00:00 JST = Sunday 2026-01-04 15:00 UTC
    const mondayJst = Date.UTC(2026, 0, 4, 15, 0);
    // Target: Sunday weekday=0 12:00 → 6 days ahead
    const occurrence = computeNextOccurrence(0, 12, 0, mondayJst);
    // Sunday 2026-01-11 12:00 JST = 03:00 UTC
    expect(occurrence).toBe(Date.UTC(2026, 0, 11, 3, 0));
  });
});

describe("scheduleNextOccurrence", () => {
  it("inserts a schedules row when due and updates lastInsertedAt", () => {
    const rule = makeRule(); // Friday 21:00
    // Use an anchor that puts next Friday within the LOOKAHEAD_MS window
    const now = Date.UTC(2026, 0, 7, 12, 0); // Wed 21:00 JST → next Fri is 2 days away
    const insertedId = scheduleNextOccurrence(rule, now);
    expect(insertedId).not.toBeNull();

    const inserted = getDb().select().from(schedules).all();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].startsAt).toBe(Date.UTC(2026, 0, 9, 12, 0)); // Fri 21:00 JST

    const updatedRule = getRule(rule.id);
    expect(updatedRule?.lastInsertedAt).toBe(inserted[0].startsAt);
  });

  it("skips duplicate occurrence (lastInsertedAt matches the next occurrence)", () => {
    const rule = makeRule();
    const now = Date.UTC(2026, 0, 7, 12, 0);
    const firstId = scheduleNextOccurrence(rule, now);
    expect(firstId).not.toBeNull();

    // Run again — should detect lastInsertedAt and skip
    const refreshed = getRule(rule.id)!;
    const secondId = scheduleNextOccurrence(refreshed, now);
    expect(secondId).toBeNull();

    const inserted = getDb().select().from(schedules).all();
    expect(inserted).toHaveLength(1);
  });

  it("skips when an existing schedule is within DEDUP_WINDOW_MS in the same channel", () => {
    const rule = makeRule({ channelId: "c-shared" });
    const now = Date.UTC(2026, 0, 7, 12, 0);
    const targetOccurrence = Date.UTC(2026, 0, 9, 12, 0); // Fri 21:00 JST

    // Insert a pre-existing schedule that overlaps the dedup window
    getDb()
      .insert(schedules)
      .values({
        id: "manual",
        guildId: "g1",
        channelId: "c-shared",
        startsAt: targetOccurrence + DEDUP_WINDOW_MS / 2, // within ±60min
        createdAt: now,
        createdBy: "u-other",
      })
      .run();

    const ret = scheduleNextOccurrence(rule, now);
    expect(ret).toBeNull();

    const allSchedules = getDb().select().from(schedules).all();
    expect(allSchedules).toHaveLength(1);
    expect(allSchedules[0].id).toBe("manual");
  });

  it("uses the rule's note (with [定期] prefix) when set", () => {
    const rule = makeRule({ note: "練習日" });
    const now = Date.UTC(2026, 0, 7, 12, 0);
    scheduleNextOccurrence(rule, now);
    const inserted = getDb().select().from(schedules).all();
    expect(inserted[0].note).toContain("[定期]");
    expect(inserted[0].note).toContain("練習日");
  });

  it("propagates mention/contentId/staticId to the inserted schedule", () => {
    const rule = makeRule({
      mention: "<@&role-123>",
      contentId: "fru",
      staticId: "static-xyz",
    });
    const now = Date.UTC(2026, 0, 7, 12, 0);
    scheduleNextOccurrence(rule, now);
    const inserted = getDb().select().from(schedules).all();
    expect(inserted[0].mention).toBe("<@&role-123>");
    expect(inserted[0].contentId).toBe("fru");
    expect(inserted[0].staticId).toBe("static-xyz");
  });
});

describe("CRUD helpers", () => {
  it("createRule + getRule round-trip", () => {
    const rule = makeRule({ id: "abc" });
    expect(getRule("abc")?.id).toBe("abc");
    expect(rule.weekday).toBe(5);
  });

  it("listActiveRules excludes inactive", () => {
    makeRule({ id: "active-1", active: true });
    makeRule({ id: "inactive-1", active: false });
    const list = listActiveRules();
    expect(list.map((r) => r.id)).toEqual(["active-1"]);
  });

  it("listRulesInGuild scopes by guildId", () => {
    makeRule({ id: "g1-a", guildId: "g1" });
    makeRule({ id: "g2-a", guildId: "g2" });
    expect(listRulesInGuild("g1").map((r) => r.id)).toEqual(["g1-a"]);
  });

  it("deleteRule removes the rule", () => {
    makeRule({ id: "to-delete" });
    deleteRule("to-delete");
    expect(getRule("to-delete")).toBeNull();
  });
});

describe("formatRuleSchedule", () => {
  it("formats as '毎週金曜 21:00 JST'", () => {
    const rule = makeRule({ weekday: 5, hourJst: 21, minuteJst: 0 });
    expect(formatRuleSchedule(rule)).toBe("毎週金曜 21:00 JST");
  });

  it("zero-pads hours and minutes", () => {
    const rule = makeRule({ weekday: 1, hourJst: 7, minuteJst: 5 });
    expect(formatRuleSchedule(rule)).toBe("毎週月曜 07:05 JST");
  });

  it("uses all 7 weekday labels", () => {
    expect(Object.values(WEEKDAY_LABELS)).toEqual(["日", "月", "火", "水", "木", "金", "土"]);
  });
});

describe("tick — end-to-end", () => {
  it("inserts schedules for all due rules in one pass", async () => {
    makeRule({ id: "a", weekday: 5, hourJst: 21, minuteJst: 0 }); // Fri 21:00
    makeRule({ id: "b", weekday: 6, hourJst: 22, minuteJst: 0 }); // Sat 22:00
    const now = Date.UTC(2026, 0, 7, 12, 0); // Wed 21:00 JST
    const inserted = await tick(now);
    expect(inserted).toBe(2);
    const all = getDb().select().from(schedules).all();
    expect(all).toHaveLength(2);
  });

  it("does nothing on repeated tick (lastInsertedAt prevents duplicates)", async () => {
    makeRule({ id: "a" });
    const now = Date.UTC(2026, 0, 7, 12, 0);
    expect(await tick(now)).toBe(1);
    expect(await tick(now)).toBe(0); // already inserted
  });
});
