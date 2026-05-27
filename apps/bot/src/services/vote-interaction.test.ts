import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MessageFlags, type ButtonInteraction } from "discord.js";
import { createDb } from "@ff14kotei/db";
import { setDbForTesting, resetDb } from "../lib/db";
import { createVote, parseCandidateInput } from "./vote";
import { handleVoteButton } from "./vote-interaction";

// Minimal interaction shape — handleVoteButton only touches these methods.
interface MockButtonInteraction {
  customId: string;
  guildId: string | null;
  user: { id: string };
  reply: ReturnType<typeof vi.fn>;
  deferUpdate: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
  followUp: ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
});

afterEach(() => {
  resetDb();
});

function makeVote(id = "v1", guildId = "g1") {
  createVote({
    id,
    guildId,
    channelId: "c1",
    creatorId: "u-creator",
    title: "title",
    candidates: [parseCandidateInput("a", 0), parseCandidateInput("b", 1)],
  });
}

function mockInteraction(opts: { customId: string; guildId: string | null; userId?: string }): MockButtonInteraction {
  return {
    customId: opts.customId,
    guildId: opts.guildId,
    user: { id: opts.userId ?? "u-clicker" },
    reply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  };
}

function asButton(m: MockButtonInteraction): ButtonInteraction {
  return m as unknown as ButtonInteraction;
}

describe("handleVoteButton — cross-guild defense", () => {
  it("rejects clicks from a different guild than the vote was created in", async () => {
    makeVote("v1", "guild-A");
    const interaction = mockInteraction({
      customId: "vote:v1:0:yes",
      guildId: "guild-B", // different
    });
    await handleVoteButton(asButton(interaction));
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "この投票は別のサーバーに属しているため投票できません。",
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
  });

  it("accepts clicks from the same guild", async () => {
    makeVote("v1", "guild-A");
    const interaction = mockInteraction({
      customId: "vote:v1:0:yes",
      guildId: "guild-A",
    });
    await handleVoteButton(asButton(interaction));
    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it("accepts when guildId is null (DM context — won't happen for vote buttons but defensive)", async () => {
    makeVote("v1", "guild-A");
    const interaction = mockInteraction({
      customId: "vote:v1:0:yes",
      guildId: null,
    });
    // Should not reject (guildId check requires both sides to be set)
    await handleVoteButton(asButton(interaction));
    expect(interaction.deferUpdate).toHaveBeenCalled();
  });
});

describe("handleVoteButton — basic validation (regression)", () => {
  it("rejects invalid customId", async () => {
    const interaction = mockInteraction({ customId: "bogus:foo", guildId: "g1" });
    await handleVoteButton(asButton(interaction));
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("不正") })
    );
  });

  it("rejects when vote no longer exists", async () => {
    const interaction = mockInteraction({ customId: "vote:missing-id:0:yes", guildId: "g1" });
    await handleVoteButton(asButton(interaction));
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("もう存在しません") })
    );
  });
});
