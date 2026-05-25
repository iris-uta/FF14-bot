import { describe, it, expect, vi, beforeEach } from "vitest";
import { execute, autocomplete, data } from "./content";
import { reloadContents } from "../lib/contents";

beforeEach(() => {
  reloadContents();
});

describe("/content command", () => {
  it("has correct command name", () => {
    expect(data.name).toBe("content");
  });

  it("has required string option 'id' with autocomplete", () => {
    const json = data.toJSON();
    const idOpt = json.options?.find((o: { name: string }) => o.name === "id");
    expect(idOpt).toBeDefined();
    expect(idOpt).toMatchObject({ required: true, autocomplete: true });
  });

  describe("execute()", () => {
    it("returns embed for valid content id", async () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: { getString: vi.fn().mockReturnValue("fru") },
        reply,
      } as unknown as Parameters<typeof execute>[0];

      await execute(interaction);

      expect(reply).toHaveBeenCalledOnce();
      const arg = reply.mock.calls[0][0];
      expect(arg.embeds).toHaveLength(1);
      const embed = arg.embeds[0].toJSON();
      expect(embed.title).toContain("絶エデン");
      expect(embed.title).toContain("FRU");
      expect(embed.fields?.find((f: { name: string }) => f.name === "Phase一覧")).toBeDefined();
    });

    it("returns ephemeral error for unknown id", async () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: { getString: vi.fn().mockReturnValue("nope") },
        reply,
      } as unknown as Parameters<typeof execute>[0];

      await execute(interaction);

      expect(reply).toHaveBeenCalledWith({
        content: expect.stringContaining("nope"),
        ephemeral: true,
      });
    });
  });

  describe("autocomplete()", () => {
    it("returns matching contents (display name match)", async () => {
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: { getFocused: vi.fn().mockReturnValue("絶") },
        respond,
      } as unknown as Parameters<typeof autocomplete>[0];

      await autocomplete(interaction);
      expect(respond).toHaveBeenCalledOnce();
      const choices = respond.mock.calls[0][0];
      expect(choices.length).toBeGreaterThan(0);
      expect(choices[0]).toMatchObject({ value: "fru" });
    });

    it("returns matching contents (short name match)", async () => {
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: { getFocused: vi.fn().mockReturnValue("fru") },
        respond,
      } as unknown as Parameters<typeof autocomplete>[0];

      await autocomplete(interaction);
      const choices = respond.mock.calls[0][0];
      expect(choices.some((c: { value: string }) => c.value === "fru")).toBe(true);
    });

    it("limits to 25 results", async () => {
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: { getFocused: vi.fn().mockReturnValue("") },
        respond,
      } as unknown as Parameters<typeof autocomplete>[0];

      await autocomplete(interaction);
      const choices = respond.mock.calls[0][0];
      expect(choices.length).toBeLessThanOrEqual(25);
    });
  });
});
