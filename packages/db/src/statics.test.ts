import { describe, it, expect, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  createDb,
  statics,
  staticSlots,
  staticMembers,
  type DbClient,
  type NewStatic,
} from "./index";

let db: DbClient;

beforeEach(() => {
  db = createDb({ path: ":memory:" });
});

const NOW = Date.now();

function insertStatic(overrides: Partial<NewStatic> = {}) {
  const values: NewStatic = {
    id: "s1",
    guildId: "g1",
    leaderId: "leader1",
    name: "週末絶エデン",
    contentId: "fru",
    roleId: "role1",
    categoryId: "cat1",
    createdAt: NOW,
    ...overrides,
  };
  db.insert(statics).values(values).run();
  return values.id;
}

describe("statics table", () => {
  it("insert + select round-trip with minimal fields", () => {
    insertStatic();
    const rows = db.select().from(statics).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "s1",
      guildId: "g1",
      leaderId: "leader1",
      name: "週末絶エデン",
      contentId: "fru",
      strategyId: null,
      pausedUntil: null,
      planId: null,
    });
  });

  it("optional fields can be set", () => {
    insertStatic({ strategyId: "ast-shiki", planId: "plan-uuid", currentPhaseId: "p3" });
    const row = db.select().from(statics).get();
    expect(row?.strategyId).toBe("ast-shiki");
    expect(row?.planId).toBe("plan-uuid");
    expect(row?.currentPhaseId).toBe("p3");
  });

  it("primary key uniqueness enforced", () => {
    insertStatic();
    expect(() => insertStatic()).toThrow();
  });
});

describe("staticSlots table", () => {
  it("8 slots per static (MT/ST/H1/H2/D1-D4)", () => {
    const sid = insertStatic();
    const roles = ["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"];
    for (const role of roles) {
      db.insert(staticSlots).values({
        staticId: sid,
        role,
        status: "open",
      }).run();
    }
    const slots = db.select().from(staticSlots).where(eq(staticSlots.staticId, sid)).all();
    expect(slots).toHaveLength(8);
  });

  it("filled slot tracks assignee and job", () => {
    const sid = insertStatic();
    db.insert(staticSlots).values({
      staticId: sid,
      role: "MT",
      status: "filled",
      assigneeUserId: "user-mt",
      job: "PLD",
      filledAt: NOW,
    }).run();

    const slot = db.select().from(staticSlots)
      .where(and(eq(staticSlots.staticId, sid), eq(staticSlots.role, "MT")))
      .get();
    expect(slot?.assigneeUserId).toBe("user-mt");
    expect(slot?.job).toBe("PLD");
    expect(slot?.filledAt).toBe(NOW);
  });

  it("open slot has jobs[] (募集対象ジョブ)", () => {
    const sid = insertStatic();
    db.insert(staticSlots).values({
      staticId: sid,
      role: "H2",
      status: "open",
      jobs: JSON.stringify(["WHM", "AST"]),
    }).run();

    const slot = db.select().from(staticSlots)
      .where(and(eq(staticSlots.staticId, sid), eq(staticSlots.role, "H2")))
      .get();
    expect(slot?.status).toBe("open");
    expect(JSON.parse(slot?.jobs ?? "[]")).toEqual(["WHM", "AST"]);
    expect(slot?.assigneeUserId).toBeNull();
  });

  it("composite PK (staticId + role) enforced", () => {
    const sid = insertStatic();
    db.insert(staticSlots).values({ staticId: sid, role: "MT", status: "open" }).run();
    expect(() =>
      db.insert(staticSlots).values({ staticId: sid, role: "MT", status: "filled" }).run()
    ).toThrow();
  });

  it("status transition: open → applied → confirmed → filled", () => {
    const sid = insertStatic();
    db.insert(staticSlots).values({ staticId: sid, role: "H2", status: "open" }).run();
    db.update(staticSlots).set({ status: "applied" })
      .where(and(eq(staticSlots.staticId, sid), eq(staticSlots.role, "H2"))).run();
    db.update(staticSlots).set({ status: "confirmed", assigneeUserId: "u1" })
      .where(and(eq(staticSlots.staticId, sid), eq(staticSlots.role, "H2"))).run();
    db.update(staticSlots).set({ status: "filled", job: "WHM", filledAt: NOW })
      .where(and(eq(staticSlots.staticId, sid), eq(staticSlots.role, "H2"))).run();

    const slot = db.select().from(staticSlots)
      .where(and(eq(staticSlots.staticId, sid), eq(staticSlots.role, "H2")))
      .get();
    expect(slot?.status).toBe("filled");
    expect(slot?.assigneeUserId).toBe("u1");
    expect(slot?.job).toBe("WHM");
  });
});

describe("staticMembers table", () => {
  it("insert active member (leftAt null)", () => {
    const sid = insertStatic();
    db.insert(staticMembers).values({
      staticId: sid,
      userId: "u1",
      gameRole: "MT",
      job: "PLD",
      joinedAt: NOW,
    }).run();

    const member = db.select().from(staticMembers)
      .where(eq(staticMembers.staticId, sid)).get();
    expect(member?.userId).toBe("u1");
    expect(member?.leftAt).toBeNull();
  });

  it("mark member as left (history preserved)", () => {
    const sid = insertStatic();
    db.insert(staticMembers).values({
      staticId: sid, userId: "u1", joinedAt: NOW,
    }).run();
    db.update(staticMembers).set({ leftAt: NOW + 1000 })
      .where(and(eq(staticMembers.staticId, sid), eq(staticMembers.userId, "u1")))
      .run();

    const member = db.select().from(staticMembers)
      .where(eq(staticMembers.staticId, sid)).get();
    expect(member?.leftAt).toBe(NOW + 1000);
  });

  it("composite PK (staticId + userId) enforced", () => {
    const sid = insertStatic();
    db.insert(staticMembers).values({ staticId: sid, userId: "u1", joinedAt: NOW }).run();
    expect(() =>
      db.insert(staticMembers).values({ staticId: sid, userId: "u1", joinedAt: NOW + 1 }).run()
    ).toThrow();
  });
});
