import { describe, it, expect, vi, beforeEach } from "vitest";
import { data, execute } from "./macro";
import { reloadContents } from "../lib/contents";

beforeEach(() => {
  reloadContents();
});

function makeInteraction(opts: { contentId: string | null; phaseId: string | null; type?: string }) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const followUp = vi.fn().mockResolvedValue(undefined);
  const type = opts.type ?? "ultimate"; // default to ultimate for fru
  return {
    interaction: {
      options: {
        getString: vi.fn((n: string) => {
          if (n === "type") return type;
          if (n === "content") return opts.contentId;
          if (n === "phase") return opts.phaseId;
          return null;
        }),
      },
      reply,
      followUp,
    } as unknown as Parameters<typeof execute>[0],
    reply,
    followUp,
  };
}

describe("/macro command", () => {
  it("has correct name and option shape (content optional for auto-detect, phase required)", () => {
    expect(data.name).toBe("macro");
    const json = data.toJSON();
    const content = json.options?.find((o: { name: string }) => o.name === "content");
    const phase = json.options?.find((o: { name: string }) => o.name === "phase");
    expect(content).toMatchObject({ autocomplete: true });
    // content is optional so it can be auto-detected from static channel
    expect(content?.required).toBeFalsy();
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

  it("returns ephemeral header + followUps for phase with macros (FRU P3)", async () => {
    const { interaction, reply, followUp } = makeInteraction({ contentId: "fru", phaseId: "p3" });
    await execute(interaction);

    // header reply
    expect(reply).toHaveBeenCalledOnce();
    const replyArg = reply.mock.calls[0][0] as { content: string; flags: number };
    expect(replyArg.content).toContain("マクロ");
    expect(replyArg.flags).toBeTruthy(); // ephemeral

    // FRU P3 has 2 macros (安置基準 + アポカリ基準), so at least 2 followUps
    expect(followUp).toHaveBeenCalled();
    expect(followUp.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const call of followUp.mock.calls) {
      const arg = call[0] as { flags?: number };
      expect(arg.flags).toBeTruthy(); // each followUp also ephemeral
    }
  });
});
