import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createDb,
  statics,
  staticSlots,
  staticMembers,
  schedules,
} from "@ff14kotei/db";
import { setDbForTesting, resetDb, getDb } from "../lib/db";
import {
  buildStaticOverview,
  renderStaticInfoEmbed,
  renderSlotGrid,
  listStaticsInGuild,
  SLOT_ORDER,
} from "./static-info";

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
});

afterEach(() => {
  resetDb();
});

const NOW = Date.now();

function insertStatic(overrides: Partial<typeof statics.$inferInsert> = {}) {
  const db = getDb();
  const values = {
    id: "s1",
    guildId: "g1",
    leaderId: "leader-1",
    name: "週末絶エデン",
    contentId: "fru",
    roleId: "role-1",
    categoryId: "cat-1",
    createdAt: NOW,
    ...overrides,
  };
  db.insert(statics).values(values).run();
  return values.id;
}

describe("buildStaticOverview", () => {
  it("returns null for unknown id", () => {
    expect(buildStaticOverview("missing")).toBeNull();
  });

  it("includes static + slots + members + upcoming schedules", () => {
    insertStatic();
    getDb()
      .insert(staticSlots)
      .values({ staticId: "s1", role: "MT", status: "filled", assigneeUserId: "u-a", job: "PLD", filledAt: NOW })
      .run();
    getDb()
      .insert(staticMembers)
      .values({ staticId: "s1", userId: "u-a", gameRole: "MT", job: "PLD", joinedAt: NOW })
      .run();
    // Past member (should be excluded)
    getDb()
      .insert(staticMembers)
      .values({ staticId: "s1", userId: "u-past", gameRole: "H1", job: "WHM", joinedAt: NOW - 10, leftAt: NOW - 5 })
      .run();
    // Upcoming schedule
    getDb()
      .insert(schedules)
      .values({
        id: "sch-1",
        guildId: "g1",
        channelId: "c1",
        startsAt: NOW + 60_000,
        staticId: "s1",
        createdAt: NOW,
        createdBy: "u-a",
      })
      .run();
    // Past schedule (should be excluded)
    getDb()
      .insert(schedules)
      .values({
        id: "sch-past",
        guildId: "g1",
        channelId: "c1",
        startsAt: NOW - 60_000,
        staticId: "s1",
        createdAt: NOW,
        createdBy: "u-a",
      })
      .run();

    const o = buildStaticOverview("s1", NOW)!;
    expect(o.vstatic.name).toBe("週末絶エデン");
    expect(o.slots).toHaveLength(1);
    expect(o.slots[0].role).toBe("MT");
    expect(o.members).toHaveLength(1);
    expect(o.members[0].userId).toBe("u-a"); // active only
    expect(o.upcoming).toHaveLength(1);
    expect(o.upcoming[0].id).toBe("sch-1");
  });

  it("looks up content metadata when available", () => {
    insertStatic({ contentId: "fru" });
    const o = buildStaticOverview("s1", NOW)!;
    // fru content is loaded from data/contents/fru.yaml; just check it's not null
    expect(o.content).not.toBeNull();
    expect(o.content?.id).toBe("fru");
  });

  it("handles unknown content gracefully (content=null)", () => {
    insertStatic({ contentId: "nonexistent-99" });
    const o = buildStaticOverview("s1", NOW)!;
    expect(o.content).toBeNull();
  });
});

describe("renderSlotGrid", () => {
  it("renders all 8 roles even if no slots inserted (all 募集中)", () => {
    const grid = renderSlotGrid([]);
    for (const role of SLOT_ORDER) {
      expect(grid).toContain(role);
    }
    expect(grid.split("\n")).toHaveLength(8);
  });

  it("shows assignee mention + job when filled", () => {
    const grid = renderSlotGrid([
      {
        staticId: "s1",
        role: "MT",
        status: "filled",
        assigneeUserId: "u-alice",
        job: "PLD",
        jobs: null,
        filledAt: NOW,
      },
    ]);
    expect(grid).toContain("<@u-alice>");
    expect(grid).toContain("PLD");
    expect(grid).toContain("完了");
  });

  it("shows job pool [PLD/WAR] when open with jobs JSON", () => {
    const grid = renderSlotGrid([
      {
        staticId: "s1",
        role: "ST",
        status: "open",
        assigneeUserId: null,
        job: null,
        jobs: JSON.stringify(["PLD", "WAR"]),
        filledAt: null,
      },
    ]);
    expect(grid).toContain("[PLD/WAR]");
  });
});

describe("renderStaticInfoEmbed", () => {
  it("includes static name + leader mention in title/description", () => {
    insertStatic({ leaderId: "u-leader" });
    const o = buildStaticOverview("s1", NOW)!;
    const data = renderStaticInfoEmbed(o).toJSON();
    expect(data.title).toContain("週末絶エデン");
    expect(data.description).toContain("<@u-leader>");
  });

  it("shows paused state with ⏸️ prefix", () => {
    insertStatic({ pausedUntil: NOW + 60_000 });
    const o = buildStaticOverview("s1", NOW)!;
    const data = renderStaticInfoEmbed(o).toJSON();
    expect(data.title?.startsWith("⏸️")).toBe(true);
  });

  it("shows current phase when set", () => {
    insertStatic({ currentPhaseId: "p3" });
    const o = buildStaticOverview("s1", NOW)!;
    const data = renderStaticInfoEmbed(o).toJSON();
    expect(data.description).toContain("p3");
  });

  it("has 'なし' placeholder when no upcoming schedules", () => {
    insertStatic();
    const o = buildStaticOverview("s1", NOW)!;
    const data = renderStaticInfoEmbed(o).toJSON();
    const upcomingField = data.fields?.find((f) => f.name.includes("予定"));
    expect(upcomingField?.value).toContain("なし");
  });
});

describe("listStaticsInGuild", () => {
  it("returns only statics in the given guild, newest first", () => {
    insertStatic({ id: "s-old", guildId: "g1", name: "old", createdAt: NOW - 1000 });
    insertStatic({ id: "s-new", guildId: "g1", name: "new", createdAt: NOW });
    insertStatic({ id: "s-other", guildId: "g2", name: "other" });
    const list = listStaticsInGuild("g1");
    expect(list.map((s) => s.id)).toEqual(["s-new", "s-old"]);
  });
});
