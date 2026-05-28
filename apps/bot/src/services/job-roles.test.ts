import { describe, it, expect, vi } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import {
  GAME_ROLES,
  JOB_CATEGORY_SPEC,
  categoryForGameRole,
  getOrCreateJobRoles,
  assignJobRoleByGameRole,
  type JobCategory,
} from "./job-roles";

describe("categoryForGameRole", () => {
  it("maps tank slots to tank", () => {
    expect(categoryForGameRole("MT")).toBe("tank");
    expect(categoryForGameRole("ST")).toBe("tank");
  });
  it("maps healer slots to healer", () => {
    expect(categoryForGameRole("H1")).toBe("healer");
    expect(categoryForGameRole("H2")).toBe("healer");
  });
  it("maps D1-D4 to dps", () => {
    for (const r of ["D1", "D2", "D3", "D4"] as const) {
      expect(categoryForGameRole(r)).toBe("dps");
    }
  });
});

describe("JOB_CATEGORY_SPEC", () => {
  it("has the 3 categories with distinct colors", () => {
    const colors = new Set(Object.values(JOB_CATEGORY_SPEC).map((s) => s.color));
    expect(colors.size).toBe(3);
  });
  it("tank is blue, healer is green, dps is red", () => {
    expect(JOB_CATEGORY_SPEC.tank.color).toBe(0x3498db);
    expect(JOB_CATEGORY_SPEC.healer.color).toBe(0x2ecc71);
    expect(JOB_CATEGORY_SPEC.dps.color).toBe(0xe74c3c);
  });
  it("GAME_ROLES has all 8 slots in order", () => {
    expect(GAME_ROLES).toEqual(["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"]);
  });
});

// ── getOrCreateJobRoles ─────────────────────────────────────────────────────

function makeMockRole(id: string, name: string, position = 1) {
  return { id, name, position };
}

function makeMockGuild(opts: {
  existingRoleNames?: string[];
  ownerId?: string;
}) {
  const cache = new Map<string, ReturnType<typeof makeMockRole>>();
  for (const n of opts.existingRoleNames ?? []) {
    cache.set(`role-${n}`, makeMockRole(`role-${n}`, n));
  }
  const createMock = vi.fn(async (input: { name: string; color: number }) => {
    const role = makeMockRole(`new-${input.name}`, input.name);
    cache.set(role.id, role);
    return role;
  });
  return {
    ownerId: opts.ownerId ?? "owner-1",
    roles: {
      cache: {
        find: (predicate: (r: ReturnType<typeof makeMockRole>) => boolean) => {
          for (const r of cache.values()) if (predicate(r)) return r;
          return undefined;
        },
      },
      create: createMock,
    },
    members: { me: null }, // overridden per-test
    _createMock: createMock,
    _cache: cache,
  };
}

describe("getOrCreateJobRoles", () => {
  it("creates all 3 roles when none exist", async () => {
    const guild = makeMockGuild({ existingRoleNames: [] });
    const roles = await getOrCreateJobRoles(guild as never);
    expect(roles.tank.name).toBe("タンク");
    expect(roles.healer.name).toBe("ヒーラー");
    expect(roles.dps.name).toBe("DPS");
    expect(guild._createMock).toHaveBeenCalledTimes(3);
  });

  it("reuses existing roles by name (no duplicate creation)", async () => {
    const guild = makeMockGuild({ existingRoleNames: ["タンク", "ヒーラー", "DPS"] });
    const roles = await getOrCreateJobRoles(guild as never);
    expect(roles.tank.id).toBe("role-タンク");
    expect(roles.healer.id).toBe("role-ヒーラー");
    expect(roles.dps.id).toBe("role-DPS");
    expect(guild._createMock).not.toHaveBeenCalled();
  });

  it("creates only the missing roles when some exist", async () => {
    const guild = makeMockGuild({ existingRoleNames: ["タンク"] });
    const roles = await getOrCreateJobRoles(guild as never);
    expect(roles.tank.id).toBe("role-タンク"); // reused
    expect(roles.healer.id).toBe("new-ヒーラー"); // created
    expect(roles.dps.id).toBe("new-DPS"); // created
    expect(guild._createMock).toHaveBeenCalledTimes(2);
  });
});

// ── assignJobRoleByGameRole ─────────────────────────────────────────────────

function makeMockMember(opts: {
  id?: string;
  guildOwnerId?: string;
  ownedRoleIds?: string[];
  botHasManageRoles?: boolean;
  botHighestPosition?: number;
  jobRolePosition?: number;
}) {
  const ownedSet = new Set(opts.ownedRoleIds ?? []);
  const ownedCache = {
    has: (id: string) => ownedSet.has(id),
    filter: (fn: (r: { id: string }) => boolean) => {
      const m = new Map<string, { id: string }>();
      for (const id of ownedSet) {
        if (fn({ id })) m.set(id, { id });
      }
      return m;
    },
  };
  const addMock = vi.fn(async (id: string) => {
    if (typeof id === "string") ownedSet.add(id);
    return undefined;
  });
  const removeMock = vi.fn(async (ids: string | string[]) => {
    const arr = Array.isArray(ids) ? ids : [ids];
    for (const i of arr) ownedSet.delete(i);
    return undefined;
  });
  const guildCache = new Map<string, ReturnType<typeof makeMockRole>>();
  guildCache.set("role-タンク", { ...makeMockRole("role-タンク", "タンク"), position: opts.jobRolePosition ?? 1 });
  guildCache.set("role-ヒーラー", { ...makeMockRole("role-ヒーラー", "ヒーラー"), position: opts.jobRolePosition ?? 1 });
  guildCache.set("role-DPS", { ...makeMockRole("role-DPS", "DPS"), position: opts.jobRolePosition ?? 1 });
  return {
    id: opts.id ?? "user-1",
    guild: {
      ownerId: opts.guildOwnerId ?? "owner-other",
      roles: {
        cache: {
          find: (p: (r: ReturnType<typeof makeMockRole>) => boolean) => {
            for (const r of guildCache.values()) if (p(r)) return r;
            return undefined;
          },
        },
        create: vi.fn(),
      },
      members: {
        me: {
          permissions: {
            has: (perm: bigint) =>
              perm === PermissionFlagsBits.ManageRoles
                ? (opts.botHasManageRoles ?? true)
                : false,
          },
          roles: {
            highest: { position: opts.botHighestPosition ?? 100 },
          },
        },
      },
    },
    roles: {
      cache: ownedCache,
      add: addMock,
      remove: removeMock,
    },
    _addMock: addMock,
    _removeMock: removeMock,
    _ownedSet: ownedSet,
  };
}

describe("assignJobRoleByGameRole", () => {
  it("assigns tank role for MT", async () => {
    const member = makeMockMember({});
    const cat = await assignJobRoleByGameRole(member as never, "MT");
    expect(cat).toBe("tank");
    expect(member._addMock).toHaveBeenCalledWith(
      "role-タンク",
      expect.stringContaining("assigned")
    );
  });

  it("assigns healer role for H1", async () => {
    const member = makeMockMember({});
    const cat = await assignJobRoleByGameRole(member as never, "H1");
    expect(cat).toBe("healer");
    expect(member._addMock).toHaveBeenCalledWith(
      "role-ヒーラー",
      expect.anything()
    );
  });

  it("assigns dps role for D3", async () => {
    const member = makeMockMember({});
    const cat = await assignJobRoleByGameRole(member as never, "D3");
    expect(cat).toBe("dps");
    expect(member._addMock).toHaveBeenCalledWith("role-DPS", expect.anything());
  });

  it("removes the previous job role when re-assigning across categories", async () => {
    const member = makeMockMember({ ownedRoleIds: ["role-タンク"] });
    await assignJobRoleByGameRole(member as never, "H1");
    expect(member._removeMock).toHaveBeenCalledWith(
      ["role-タンク"],
      expect.anything()
    );
    expect(member._addMock).toHaveBeenCalledWith("role-ヒーラー", expect.anything());
  });

  it("does not re-add when the member already has the correct role", async () => {
    const member = makeMockMember({ ownedRoleIds: ["role-タンク"] });
    await assignJobRoleByGameRole(member as never, "ST"); // ST → tank, already has
    expect(member._addMock).not.toHaveBeenCalled();
    expect(member._removeMock).not.toHaveBeenCalled();
  });

  it("throws when bot lacks Manage Roles", async () => {
    const member = makeMockMember({ botHasManageRoles: false });
    await expect(assignJobRoleByGameRole(member as never, "MT")).rejects.toThrow(/Manage Roles/);
  });

  it("throws when target user is the guild owner", async () => {
    const member = makeMockMember({ id: "owner-1", guildOwnerId: "owner-1" });
    await expect(assignJobRoleByGameRole(member as never, "MT")).rejects.toThrow(/owner/);
  });

  it("throws when bot role is below the job role in hierarchy", async () => {
    const member = makeMockMember({ botHighestPosition: 1, jobRolePosition: 5 });
    await expect(assignJobRoleByGameRole(member as never, "MT")).rejects.toThrow(/階層/);
  });
});
