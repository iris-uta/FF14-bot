import { describe, it, expect, vi, beforeEach } from "vitest";
import { data, execute, autocomplete } from "./post-phase";
import { reloadContents } from "../lib/contents";

beforeEach(() => {
  reloadContents();
});

function makeInteraction(opts: { contentId: string | null; phaseId: string | null }) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const followUp = vi.fn().mockResolvedValue(undefined);
  return {
    interaction: {
      options: {
        getString: vi.fn((name: string) => {
          if (name === "content") return opts.contentId;
          if (name === "phase") return opts.phaseId;
          return null;
        }),
      },
      reply,
      editReply,
      deferReply,
      followUp,
    } as unknown as Parameters<typeof execute>[0],
    reply,
    editReply,
    deferReply,
    followUp,
  };
}

describe("/post-phase command", () => {
  it("has correct command name", () => {
    expect(data.name).toBe("post-phase");
  });

  it("has required content and phase options, both with autocomplete", () => {
    const json = data.toJSON();
    const content = json.options?.find((o: { name: string }) => o.name === "content");
    const phase = json.options?.find((o: { name: string }) => o.name === "phase");
    expect(content).toMatchObject({ required: true, autocomplete: true });
    expect(phase).toMatchObject({ required: true, autocomplete: true });
  });

  it("rejects unknown content", async () => {
    const { interaction, reply } = makeInteraction({ contentId: "nope", phaseId: "p1" });
    await execute(interaction);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("nope") })
    );
  });

  it("rejects unknown phase", async () => {
    const { interaction, reply } = makeInteraction({ contentId: "fru", phaseId: "p99" });
    await execute(interaction);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("p99") })
    );
  });

  it("posts an embed and follow-ups for valid phase with macros", async () => {
    const { interaction, deferReply, editReply, followUp } = makeInteraction({
      contentId: "fru",
      phaseId: "p3",
    });
    await execute(interaction);
    expect(deferReply).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledOnce();
    const embedArg = (editReply.mock.calls[0][0] as { embeds: unknown[] }).embeds;
    expect(embedArg).toHaveLength(1);
    // FRU P3 has macros (安置基準 + アポカリ基準) → expect at least 2 followUps
    expect(followUp).toHaveBeenCalled();
  });

  describe("autocomplete()", () => {
    it("returns content matches when 'content' focused", async () => {
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: {
          getFocused: (returnFull?: boolean) =>
            returnFull ? { name: "content", value: "絶" } : "絶",
          getString: () => null,
        },
        respond,
      } as unknown as Parameters<typeof autocomplete>[0];
      await autocomplete(interaction);
      const choices = respond.mock.calls[0][0];
      expect(choices.some((c: { value: string }) => c.value === "fru")).toBe(true);
    });

    it("returns phase matches when 'phase' focused after content selected", async () => {
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: {
          getFocused: (returnFull?: boolean) =>
            returnFull ? { name: "phase", value: "p" } : "p",
          getString: (name: string) => (name === "content" ? "fru" : null),
        },
        respond,
      } as unknown as Parameters<typeof autocomplete>[0];
      await autocomplete(interaction);
      const choices = respond.mock.calls[0][0];
      expect(choices.length).toBeGreaterThan(0);
      expect(choices[0]).toHaveProperty("value");
      expect(choices.map((c: { value: string }) => c.value)).toContain("p1");
    });

    it("returns empty when 'phase' focused but no content selected", async () => {
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: {
          getFocused: (returnFull?: boolean) =>
            returnFull ? { name: "phase", value: "" } : "",
          getString: () => null,
        },
        respond,
      } as unknown as Parameters<typeof autocomplete>[0];
      await autocomplete(interaction);
      expect(respond).toHaveBeenCalledWith([]);
    });
  });
});
