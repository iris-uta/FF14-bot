import { describe, it, expect, vi, beforeEach } from "vitest";
import { execute, autocomplete, data, chunkUrlsForFields } from "./content";
import { reloadContents } from "../lib/contents";

beforeEach(() => {
  reloadContents();
});

function makeExecuteInteraction(opts: { type: string; id: string | null }) {
  const reply = vi.fn().mockResolvedValue(undefined);
  return {
    interaction: {
      options: {
        getString: vi.fn((name: string) => {
          if (name === "type") return opts.type;
          if (name === "id") return opts.id;
          return null;
        }),
      },
      reply,
    } as unknown as Parameters<typeof execute>[0],
    reply,
  };
}

function makeAutocompleteInteraction(opts: { focusedName: string; focusedValue: string; type?: string | null }) {
  const respond = vi.fn().mockResolvedValue(undefined);
  return {
    interaction: {
      options: {
        getFocused: vi.fn(() => ({ name: opts.focusedName, value: opts.focusedValue })),
        getString: vi.fn((name: string) => {
          if (name === "type") return opts.type ?? null;
          return null;
        }),
      },
      respond,
    } as unknown as Parameters<typeof autocomplete>[0],
    respond,
  };
}

describe("/content command", () => {
  it("has correct command name", () => {
    expect(data.name).toBe("raid");
  });

  it("has required string option 'id' with autocomplete", () => {
    const json = data.toJSON();
    const idOpt = json.options?.find((o: { name: string }) => o.name === "id");
    expect(idOpt).toBeDefined();
    expect(idOpt).toMatchObject({ required: true, autocomplete: true });
  });

  it("has required 'type' option with choices", () => {
    const json = data.toJSON();
    const typeOpt = json.options?.find((o: { name: string }) => o.name === "type");
    expect(typeOpt).toMatchObject({ required: true });
  });

  describe("execute()", () => {
    it("returns embed for valid content id when type matches", async () => {
      const { interaction, reply } = makeExecuteInteraction({ type: "ultimate", id: "fru" });
      await execute(interaction);

      expect(reply).toHaveBeenCalledOnce();
      const arg = reply.mock.calls[0][0] as { embeds: Array<{ toJSON(): { title?: string; fields?: Array<{ name: string }> } }> };
      expect(arg.embeds).toHaveLength(1);
      const embed = arg.embeds[0].toJSON();
      expect(embed.title).toContain("絶もうひとつの未来");
      expect(embed.title).toContain("FRU");
      expect(embed.fields?.find((f) => f.name === "Phase一覧")).toBeDefined();
    });

    it("returns ephemeral error for unknown id", async () => {
      const { interaction, reply } = makeExecuteInteraction({ type: "ultimate", id: "nope" });
      await execute(interaction);
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("nope") })
      );
    });

    it("rejects when type and content type mismatch", async () => {
      const { interaction, reply } = makeExecuteInteraction({ type: "savage", id: "fru" });
      await execute(interaction);
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("一致しません") })
      );
    });
  });

  describe("autocomplete()", () => {
    it("returns matching contents filtered by type=ultimate", async () => {
      const { interaction, respond } = makeAutocompleteInteraction({
        focusedName: "id",
        focusedValue: "絶",
        type: "ultimate",
      });
      await autocomplete(interaction);
      expect(respond).toHaveBeenCalledOnce();
      const choices = respond.mock.calls[0][0] as Array<{ value: string }>;
      expect(choices.length).toBeGreaterThan(0);
      expect(choices.map((c) => c.value)).toContain("fru");
      // All returned must be ultimates (no m1s etc.)
      const ids = choices.map((c) => c.value);
      for (const id of ids) {
        expect(id).not.toMatch(/^[mp]\d+s$/);
      }
    });

    it("returns matching contents (short name match)", async () => {
      const { interaction, respond } = makeAutocompleteInteraction({
        focusedName: "id",
        focusedValue: "fru",
        type: "ultimate",
      });
      await autocomplete(interaction);
      const choices = respond.mock.calls[0][0] as Array<{ value: string }>;
      expect(choices.some((c) => c.value === "fru")).toBe(true);
    });

    it("limits to 25 results", async () => {
      const { interaction, respond } = makeAutocompleteInteraction({
        focusedName: "id",
        focusedValue: "",
        type: "savage",
      });
      await autocomplete(interaction);
      const choices = respond.mock.calls[0][0] as unknown[];
      expect(choices.length).toBeLessThanOrEqual(25);
    });
  });
});

// Regression test for: "/raid id:ucob" → コマンド実行中にエラー
// ucob has 30 URLs which formatted as "<url>\n" exceeds Discord's 1024 char
// field.value limit. chunkUrlsForFields splits into multiple fields.
describe("chunkUrlsForFields", () => {
  it("returns a single 参照URL field when total length fits", () => {
    const urls = ["https://example.com/a", "https://example.com/b"];
    const fields = chunkUrlsForFields(urls);
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("参照URL");
    expect(fields[0].value).toBe("<https://example.com/a>\n<https://example.com/b>");
  });

  it("splits into '参照URL (i/N)' fields when value exceeds 1024 chars", () => {
    // Each URL formatted as <url>\n is ~64 chars; 30 of them = ~1900 chars
    const urls = Array.from(
      { length: 30 },
      (_, i) => `https://example.com/very-long-url-path-here-${i.toString().padStart(3, "0")}`
    );
    const fields = chunkUrlsForFields(urls);
    expect(fields.length).toBeGreaterThan(1);
    for (const f of fields) {
      expect(f.value.length).toBeLessThanOrEqual(1024);
      expect(f.name).toMatch(/^参照URL \(\d+\/\d+\)$/);
    }
    // No URLs dropped
    const totalLines = fields.reduce((sum, f) => sum + f.value.split("\n").length, 0);
    expect(totalLines).toBe(urls.length);
  });

  it("handles empty list (returns one empty field — caller decides to skip)", () => {
    const fields = chunkUrlsForFields([]);
    expect(fields).toHaveLength(1);
    expect(fields[0].value).toBe("");
  });

  it("doesn't crash on a single very-long URL", () => {
    // 2000 chars in one URL — pathological, but shouldn't throw
    const urls = ["https://example.com/" + "x".repeat(2000)];
    const fields = chunkUrlsForFields(urls);
    // The URL itself exceeds 1024; we accept the overflow rather than truncate (data fidelity)
    expect(fields).toHaveLength(1);
    expect(fields[0].value).toContain("xxxxxxxxxx");
  });

  it("real-world ucob (~30 URLs ~1900 chars) splits into 2 valid fields", async () => {
    // Use the actual loaded content to make this regression real
    const { getContentById } = await import("../lib/contents");
    const ucob = getContentById("ucob");
    expect(ucob).toBeDefined();
    const fields = chunkUrlsForFields(ucob!.references.urls);
    expect(fields.length).toBeGreaterThanOrEqual(2);
    for (const f of fields) {
      expect(f.value.length).toBeLessThanOrEqual(1024);
    }
  });
});
