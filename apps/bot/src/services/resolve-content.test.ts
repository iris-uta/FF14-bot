import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, statics, type NewStatic } from "@ff14kotei/db";
import { setDbForTesting, resetDb } from "../lib/db";
import { resolveContent, resolveContentOrError } from "./resolve-content";

const NOW = Date.now();

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
});

afterEach(() => {
  resetDb();
});

import { afterEach } from "vitest";
import { getDb } from "../lib/db";

function seedStatic(overrides: Partial<NewStatic> = {}): NewStatic {
  const s: NewStatic = {
    id: "s1",
    guildId: "g1",
    leaderId: "leader1",
    name: "テスト固定",
    contentId: "fru",
    roleId: "role1",
    categoryId: "cat-fru",
    lobbyChannelId: "lobby-1",
    createdAt: NOW,
    ...overrides,
  };
  getDb().insert(statics).values(s).run();
  return s;
}

function makeInteraction(opts: {
  guildId?: string | null;
  channelId?: string | null;
  parentId?: string | null;
  contentOption?: string | null;
  typeOption?: string | null;
}) {
  return {
    guildId: opts.guildId ?? "g1",
    channel: opts.channelId
      ? { id: opts.channelId, parentId: opts.parentId ?? null }
      : null,
    options: {
      getString: vi.fn((name: string) => {
        if (name === "content") return opts.contentOption ?? null;
        if (name === "type") return opts.typeOption ?? null;
        return null;
      }),
    },
  } as unknown as Parameters<typeof resolveContent>[0];
}

describe("resolveContent", () => {
  it("uses explicit content option if provided", () => {
    seedStatic();
    const result = resolveContent(makeInteraction({ contentOption: "fru" }));
    expect(result?.content.id).toBe("fru");
    expect(result?.autoDetected).toBe(false);
  });

  it("auto-detects from channel parent (category) if no explicit content", () => {
    seedStatic({ categoryId: "cat-fru" });
    const result = resolveContent(
      makeInteraction({ channelId: "p3-channel", parentId: "cat-fru" })
    );
    expect(result?.content.id).toBe("fru");
    expect(result?.autoDetected).toBe(true);
    expect(result?.staticId).toBe("s1");
  });

  it("auto-detects when channel is the lobby itself", () => {
    seedStatic({ lobbyChannelId: "lobby-1" });
    const result = resolveContent(
      makeInteraction({ channelId: "lobby-1", parentId: null })
    );
    expect(result?.content.id).toBe("fru");
    expect(result?.autoDetected).toBe(true);
  });

  it("returns null when no explicit content and channel not in any static", () => {
    seedStatic({ categoryId: "cat-fru" });
    const result = resolveContent(
      makeInteraction({ channelId: "x", parentId: "other-cat" })
    );
    expect(result).toBeNull();
  });

  it("returns null for unknown explicit content id", () => {
    const result = resolveContent(makeInteraction({ contentOption: "nope" }));
    expect(result).toBeNull();
  });

  it("explicit content takes priority over channel detection", () => {
    seedStatic({ contentId: "fru", categoryId: "cat-fru" });
    const result = resolveContent(
      makeInteraction({
        contentOption: "top",
        channelId: "x",
        parentId: "cat-fru",
      })
    );
    expect(result?.content.id).toBe("top");
    expect(result?.autoDetected).toBe(false);
  });
});

describe("resolveContentOrError", () => {
  it("returns ok=true with content when found", () => {
    seedStatic();
    const r = resolveContentOrError(makeInteraction({ contentOption: "fru" }) as never);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content.id).toBe("fru");
  });

  it("returns error for unknown explicit content", () => {
    const r = resolveContentOrError(makeInteraction({ contentOption: "nope" }) as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("nope");
  });

  it("returns error when no content and not in a static channel", () => {
    const r = resolveContentOrError(
      makeInteraction({ channelId: "x", parentId: "other" }) as never
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("固定 channel");
  });

  it("returns error when type/content explicit but mismatched", () => {
    seedStatic();
    const r = resolveContentOrError(
      makeInteraction({ contentOption: "fru", typeOption: "savage" }) as never
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("一致しません");
  });

  it("type mismatch is NOT checked for auto-detected content", () => {
    // If user provides type:savage but is in a fru static channel (auto-detect),
    // we trust the static (don't reject). Type is just a filter for explicit input.
    seedStatic({ contentId: "fru", categoryId: "cat-fru" });
    const r = resolveContentOrError(
      makeInteraction({
        typeOption: "savage",
        channelId: "x",
        parentId: "cat-fru",
      }) as never
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content.id).toBe("fru");
      expect(r.autoDetected).toBe(true);
    }
  });
});
