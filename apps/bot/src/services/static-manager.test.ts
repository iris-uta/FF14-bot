import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChannelType } from "discord.js";
import {
  createDb,
  statics,
  staticSlots,
  staticMembers,
  type NewStatic
} from "@ff14kotei/db";
import type { Content } from "@ff14kotei/schema";
import { getDb, setDbForTesting, resetDb } from "../lib/db";
import { findStaticByName, findStaticForChannel, initStatic } from "./static-manager";
import { VALID_ROLES } from "./members-parser";

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
});

afterEach(() => {
  resetDb();
});

const NOW = Date.now();

function insert(overrides: Partial<NewStatic> = {}) {
  const values: NewStatic = {
    id: "s-default",
    guildId: "g1",
    leaderId: "leader-1",
    name: "週末絶エデン",
    contentId: "fru",
    roleId: "role-1",
    categoryId: "cat-1",
    createdAt: NOW,
    ...overrides
  };
  getDb().insert(statics).values(values).run();
  return values.id!;
}

describe("findStaticByName", () => {
  it("returns the matching static", () => {
    insert({ id: "a", guildId: "g1", name: "週末絶エデン" });
    const got = findStaticByName("g1", "週末絶エデン");
    expect(got?.id).toBe("a");
  });

  it("returns null when no match in this guild", () => {
    insert({ id: "a", guildId: "g1", name: "週末絶エデン" });
    expect(findStaticByName("g1", "別の固定")).toBeNull();
  });

  it("scopes by guildId — same name in different guild does not match", () => {
    insert({ id: "a", guildId: "g1", name: "週末絶エデン" });
    insert({ id: "b", guildId: "g2", name: "週末絶エデン" });
    const got = findStaticByName("g1", "週末絶エデン");
    expect(got?.id).toBe("a");
  });

  it("is case-sensitive (Discord names are too)", () => {
    insert({ id: "a", name: "FRU" });
    expect(findStaticByName("g1", "fru")).toBeNull();
    expect(findStaticByName("g1", "FRU")?.id).toBe("a");
  });
});

describe("findStaticForChannel — priority order", () => {
  it("matches by parentId (channel in static's category) first", () => {
    insert({ id: "byCategory", categoryId: "cat-A", lobbyChannelId: "lobby-A" });
    insert({ id: "byLobby", categoryId: "cat-B", lobbyChannelId: "channelX" });
    const got = findStaticForChannel("g1", "channelX", "cat-A");
    expect(got?.id).toBe("byCategory"); // category beats lobby
  });

  it("falls through to lobbyChannelId when parentId doesn't match", () => {
    insert({ id: "byLobby", categoryId: "cat-X", lobbyChannelId: "lobby-Y" });
    const got = findStaticForChannel("g1", "lobby-Y", "unrelated-parent");
    expect(got?.id).toBe("byLobby");
  });

  it("falls through to categoryId match (called inside the category itself)", () => {
    insert({ id: "byCategoryId", categoryId: "cat-Z" });
    const got = findStaticForChannel("g1", "cat-Z", null);
    expect(got?.id).toBe("byCategoryId");
  });

  it("returns null when nothing matches", () => {
    insert({ id: "x", categoryId: "cat-A", lobbyChannelId: "lobby-A" });
    expect(findStaticForChannel("g1", "random", "another-random")).toBeNull();
  });

  it("respects guildId boundary", () => {
    insert({ id: "g1-static", guildId: "g1", categoryId: "shared-cat" });
    insert({ id: "g2-static", guildId: "g2", categoryId: "shared-cat" });
    const got = findStaticForChannel("g2", "ignored", "shared-cat");
    expect(got?.id).toBe("g2-static");
  });

  it("handles null/undefined parentId without crashing", () => {
    insert({ id: "x", categoryId: "cat-A" });
    expect(findStaticForChannel("g1", "cat-A", null)).not.toBeNull();
    expect(findStaticForChannel("g1", "cat-A", undefined)).not.toBeNull();
  });
});

describe("initStatic — DB side effects", () => {
  // Helper: build a minimal Content object that satisfies the schema
  function makeContent(overrides: Partial<Content> = {}): Content {
    return {
      id: "test-content",
      displayName: "テストコンテンツ",
      shortName: "TC",
      type: "ultimate",
      phases: [
        { id: "p1", name: "P1", order: 0, videos: [], strategies: [] },
        { id: "p2", name: "P2", order: 1, videos: [], strategies: [] }
      ],
      macros: [],
      recruitmentTemplates: [],
      references: { urls: [] },
      ...overrides
    } as Content;
  }

  // Helper: build a stub Guild that records calls
  function makeStubGuild() {
    const createdRoles: { name: string; color: number }[] = [];
    const createdChannels: { name: string; type: number; parent?: string }[] = [];

    const role = { id: "stub-role-id" };
    const category = { id: "stub-category-id" };

    let textChannelCounter = 0;

    const guild = {
      id: "g-stub",
      roles: {
        create: vi.fn(async (opts: { name: string; color: number }) => {
          createdRoles.push({ name: opts.name, color: opts.color });
          return role;
        })
      },
      channels: {
        create: vi.fn(async (opts: { name: string; type: number; parent?: string }) => {
          createdChannels.push({ name: opts.name, type: opts.type, parent: opts.parent });
          if (opts.type === ChannelType.GuildCategory) return category;
          // Mock TextChannel: minimal methods used by postPhaseToChannel / postUtilityIntro
          textChannelCounter++;
          return {
            id: `stub-channel-${textChannelCounter}`,
            send: vi.fn().mockResolvedValue({ pin: vi.fn().mockResolvedValue(undefined) })
          };
        })
      },
      members: {
        fetch: vi.fn(async (userId: string) => ({
          id: userId,
          roles: { add: vi.fn().mockResolvedValue(undefined) }
        }))
      }
    } as never;

    return { guild, role, category, createdRoles, createdChannels };
  }

  it("inserts a static row + 8 slot rows (all open) + members", async () => {
    const { guild } = makeStubGuild();
    const content = makeContent();
    const result = await initStatic({
      guild,
      leaderId: "leader-1",
      name: "テスト固定",
      content,
      mode: "minimal",
      members: [
        { userId: "u-alice", role: "MT", job: "PLD" },
        { userId: "u-bob", role: "H1", job: "WHM" }
      ]
    });

    // statics row
    const allStatics = getDb().select().from(statics).all();
    expect(allStatics).toHaveLength(1);
    expect(allStatics[0].name).toBe("テスト固定");
    expect(allStatics[0].leaderId).toBe("leader-1");
    expect(allStatics[0].contentId).toBe("test-content");

    // 8 slot rows
    const allSlots = getDb().select().from(staticSlots).all();
    expect(allSlots).toHaveLength(VALID_ROLES.length);
    expect(allSlots.map((s) => s.role).sort()).toEqual([...VALID_ROLES].sort());

    // 2 filled slots, 6 open
    const filled = allSlots.filter((s) => s.status === "filled");
    expect(filled).toHaveLength(2);
    expect(filled.map((s) => s.assigneeUserId).sort()).toEqual(["u-alice", "u-bob"]);

    // member rows
    const allMembers = getDb().select().from(staticMembers).all();
    expect(allMembers).toHaveLength(2);
    expect(allMembers.every((m) => m.leftAt === null)).toBe(true);

    // Result summary
    expect(result.filledSlots).toBe(2);
    expect(result.openSlots).toBe(VALID_ROLES.length - 2);
    expect(result.mode).toBe("minimal");
  });

  it("creates a mentionable role with color matching content type", async () => {
    const { guild, createdRoles } = makeStubGuild();
    const content = makeContent({ type: "ultimate" });
    await initStatic({ guild, leaderId: "u", name: "test", content, mode: "minimal" });

    expect(createdRoles).toHaveLength(1);
    expect(createdRoles[0].name).toBe("test");
    // ultimate = 0xff5050 per ROLE_COLOR_BY_TYPE
    expect(createdRoles[0].color).toBe(0xff5050);
  });

  it("creates category + at least one phase channel per Phase", async () => {
    const { guild, createdChannels } = makeStubGuild();
    const content = makeContent(); // 2 phases (p1, p2)
    await initStatic({ guild, leaderId: "u", name: "test", content, mode: "minimal" });

    const categories = createdChannels.filter((c) => c.type === ChannelType.GuildCategory);
    const textChannels = createdChannels.filter((c) => c.type === ChannelType.GuildText);
    expect(categories).toHaveLength(1);
    expect(textChannels.length).toBeGreaterThanOrEqual(2); // at least one per phase
  });

  it("defaults mode to 'standard' when not specified", async () => {
    const { guild } = makeStubGuild();
    const content = makeContent();
    const result = await initStatic({ guild, leaderId: "u", name: "test", content });
    expect(result.mode).toBe("standard");
  });
});
