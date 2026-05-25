import { describe, it, expect, vi } from "vitest";
import { data, execute, autocomplete } from "./help";

function makeInteraction(opts: { commandName: string | null }) {
  const reply = vi.fn().mockResolvedValue(undefined);
  return {
    interaction: {
      options: { getString: vi.fn(() => opts.commandName) },
      reply,
    } as unknown as Parameters<typeof execute>[0],
    reply,
  };
}

describe("/help command", () => {
  it("has correct name", () => {
    expect(data.name).toBe("help");
  });

  it("has optional 'command' string option with autocomplete", () => {
    const json = data.toJSON();
    const opt = json.options?.find((o: { name: string }) => o.name === "command");
    expect(opt).toBeDefined();
    expect(opt).toMatchObject({ required: false, autocomplete: true });
  });

  describe("execute()", () => {
    it("lists all commands when no argument given", async () => {
      const { interaction, reply } = makeInteraction({ commandName: null });
      await execute(interaction);
      expect(reply).toHaveBeenCalledOnce();
      const arg = reply.mock.calls[0][0] as { embeds: unknown[]; flags: number };
      expect(arg.embeds).toHaveLength(1);
      const embed = (arg.embeds as Array<{ toJSON(): { title?: string; description?: string } }>)[0].toJSON();
      expect(embed.title).toContain("コマンド一覧");
      expect(embed.description).toContain("/content");
      expect(embed.description).toContain("/setup-static");
      expect(embed.description).toContain("/post-phase");
      expect(embed.description).toContain("/recruit-template");
      expect(embed.description).toContain("/help");
    });

    it("shows detail for a known command", async () => {
      const { interaction, reply } = makeInteraction({ commandName: "content" });
      await execute(interaction);
      const arg = reply.mock.calls[0][0] as { embeds: unknown[] };
      const embed = (arg.embeds as Array<{ toJSON(): { title?: string; fields?: Array<{ name: string }> } }>)[0].toJSON();
      expect(embed.title).toBe("/content");
      const optionsField = embed.fields?.find((f) => f.name === "オプション");
      expect(optionsField).toBeDefined();
    });

    it("returns ephemeral error for unknown command", async () => {
      const { interaction, reply } = makeInteraction({ commandName: "nope" });
      await execute(interaction);
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("nope") })
      );
    });
  });

  describe("autocomplete()", () => {
    it("returns matching command names, excluding 'help' itself", async () => {
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: { getFocused: () => "" },
        respond,
      } as unknown as Parameters<typeof autocomplete>[0];
      await autocomplete(interaction);
      const choices = respond.mock.calls[0][0] as Array<{ value: string }>;
      const values = choices.map((c) => c.value);
      expect(values).not.toContain("help");
      expect(values).toContain("content");
    });

    it("filters by substring", async () => {
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: { getFocused: () => "phase" },
        respond,
      } as unknown as Parameters<typeof autocomplete>[0];
      await autocomplete(interaction);
      const choices = respond.mock.calls[0][0] as Array<{ value: string }>;
      expect(choices.every((c) => c.value.toLowerCase().includes("phase"))).toBe(true);
    });
  });
});
