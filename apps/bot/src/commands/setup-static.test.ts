import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelType } from "discord.js";
import { data, execute, autocomplete } from "./setup-static";
import { reloadContents } from "../lib/contents";

beforeEach(() => {
  reloadContents();
});

interface MockChannel {
  id: string;
  name: string;
  type: ChannelType;
}

function makeInteraction(
  options: {
    contentId: string | null;
    name?: string | null;
    inGuild?: boolean;
    existingCategories?: string[];
    createImpl?: (input: { name: string; type: ChannelType; parent?: string; topic?: string }) => Promise<MockChannel>;
  } = { contentId: "fru" }
) {
  const existing: MockChannel[] = (options.existingCategories ?? []).map((name, i) => ({
    id: `existing-${i}`,
    name,
    type: ChannelType.GuildCategory,
  }));

  const createCalls: { name: string; type: ChannelType; parent?: string; topic?: string }[] = [];
  let nextId = 1000;
  const defaultCreate = async (input: typeof createCalls[number]): Promise<MockChannel> => ({
    id: String(nextId++),
    name: input.name,
    type: input.type,
  });

  const create = vi.fn(async (input: typeof createCalls[number]) => {
    createCalls.push(input);
    return (options.createImpl ?? defaultCreate)(input);
  });

  const guild = options.inGuild === false
    ? null
    : {
        channels: {
          cache: { find: (pred: (c: MockChannel) => boolean) => existing.find(pred) },
          create,
        },
      };

  const reply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  const deferReply = vi.fn().mockResolvedValue(undefined);

  return {
    interaction: {
      inGuild: () => options.inGuild !== false,
      guild,
      options: {
        getString: vi.fn((n: string, _required?: boolean) => {
          if (n === "content") return options.contentId;
          if (n === "name") return options.name ?? null;
          return null;
        }),
      },
      reply,
      editReply,
      deferReply,
    } as unknown as Parameters<typeof execute>[0],
    create,
    createCalls,
    reply,
    editReply,
    deferReply,
  };
}

describe("/setup-static command", () => {
  it("has correct command name", () => {
    expect(data.name).toBe("setup-static");
  });

  it("requires ManageChannels by default", () => {
    const json = data.toJSON();
    expect(json.default_member_permissions).toBeTruthy();
  });

  it("has 'content' string option with autocomplete", () => {
    const json = data.toJSON();
    const opt = json.options?.find((o: { name: string }) => o.name === "content");
    expect(opt).toMatchObject({ required: true, autocomplete: true });
  });

  describe("execute()", () => {
    it("rejects when not in guild", async () => {
      const { interaction, reply } = makeInteraction({ contentId: "fru", inGuild: false });
      await execute(interaction);
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("サーバー") })
      );
    });

    it("rejects when contentId unknown", async () => {
      const { interaction, reply } = makeInteraction({ contentId: "unknown-id" });
      await execute(interaction);
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("unknown-id") })
      );
    });

    it("rejects when category with same name already exists", async () => {
      const { interaction, reply } = makeInteraction({
        contentId: "fru",
        existingCategories: ["絶エデン 固定"],
      });
      await execute(interaction);
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("既に存在") })
      );
    });

    it("creates category + one channel per phase", async () => {
      const { interaction, createCalls, editReply } = makeInteraction({ contentId: "fru" });
      await execute(interaction);
      const categoryCalls = createCalls.filter((c) => c.type === ChannelType.GuildCategory);
      const textCalls = createCalls.filter((c) => c.type === ChannelType.GuildText);
      expect(categoryCalls).toHaveLength(1);
      expect(categoryCalls[0].name).toBe("絶エデン 固定");
      expect(textCalls.length).toBeGreaterThan(0);
      expect(editReply).toHaveBeenCalledOnce();
      const replyArg = (editReply.mock.calls[0][0] as { content: string }).content;
      expect(replyArg).toContain("✅");
      expect(replyArg).toContain("絶エデン");
    });

    it("uses 'name' option for category when provided", async () => {
      const { interaction, createCalls } = makeInteraction({
        contentId: "fru",
        name: "週末絶エデン",
      });
      await execute(interaction);
      expect(createCalls[0].name).toBe("週末絶エデン 固定");
    });

    it("reports failure when channel creation throws", async () => {
      const { interaction, editReply } = makeInteraction({
        contentId: "fru",
        createImpl: async () => {
          throw new Error("Missing Permissions");
        },
      });
      await execute(interaction);
      expect(editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Manage Channels"),
        })
      );
    });
  });

  describe("autocomplete()", () => {
    it("returns matches for partial query", async () => {
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        options: { getFocused: () => "絶" },
        respond,
      } as unknown as Parameters<typeof autocomplete>[0];
      await autocomplete(interaction);
      const choices = respond.mock.calls[0][0];
      expect(choices.length).toBeGreaterThan(0);
      expect(choices.map((c: { value: string }) => c.value)).toContain("fru");
    });
  });
});
