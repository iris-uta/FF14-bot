import { describe, it, expect, vi } from "vitest";
import { PermissionsBitField, ChannelType } from "discord.js";
import { buildWelcomeEmbed, findWelcomeChannel } from "./welcome";

describe("buildWelcomeEmbed", () => {
  it("returns a builder with a Japanese title", () => {
    const e = buildWelcomeEmbed().toJSON();
    expect(e.title).toContain("固定支援Bot");
    expect(e.title).toMatch(/ようこそ/);
  });

  it("describes the 3-step quickstart", () => {
    const e = buildWelcomeEmbed().toJSON();
    const fieldNames = e.fields?.map((f) => f.name) ?? [];
    expect(fieldNames.some((n) => n.startsWith("1️⃣"))).toBe(true);
    expect(fieldNames.some((n) => n.startsWith("2️⃣"))).toBe(true);
    expect(fieldNames.some((n) => n.startsWith("3️⃣"))).toBe(true);
  });

  it("mentions the 4 main command categories", () => {
    const text = buildWelcomeEmbed().toJSON().fields?.map((f) => f.value).join("\n") ?? "";
    expect(text).toContain("/setup");
    expect(text).toContain("/book");
    expect(text).toContain("/vote new");
    expect(text).toContain("/help");
  });

  it("explains required permissions", () => {
    const text = buildWelcomeEmbed().toJSON().fields?.map((f) => f.value).join("\n") ?? "";
    expect(text).toContain("Manage Channels");
    expect(text).toContain("Manage Roles");
  });
});

// Helper: minimal mock guild with a configurable channel set
interface MockChannel {
  id: string;
  type: ChannelType;
  position?: number;
  isTextBased: () => boolean;
  permissionsFor: (member: unknown) => { has: (perm: bigint) => boolean } | null;
}

function makeChannel(opts: {
  id: string;
  canSend?: boolean;
  position?: number;
  type?: ChannelType;
}): MockChannel {
  return {
    id: opts.id,
    type: opts.type ?? ChannelType.GuildText,
    position: opts.position,
    isTextBased: () => opts.type !== ChannelType.GuildVoice,
    permissionsFor: () =>
      opts.canSend === false
        ? { has: () => false }
        : { has: (perm: bigint) => perm === PermissionsBitField.Flags.SendMessages }
  };
}

function makeGuild(opts: {
  systemChannel?: MockChannel | null;
  channels: MockChannel[];
  me?: unknown;
}) {
  const channelsMap = new Map(opts.channels.map((c) => [c.id, c]));
  return {
    systemChannel: opts.systemChannel,
    members: { me: opts.me ?? {} },
    channels: {
      cache: {
        values: () => channelsMap.values(),
        get: (id: string) => channelsMap.get(id)
      }
    }
  };
}

describe("findWelcomeChannel", () => {
  it("returns null when guild.me is missing", () => {
    const guild = { systemChannel: null, members: { me: null }, channels: { cache: new Map() } };
    expect(findWelcomeChannel(guild as never)).toBeNull();
  });

  it("prefers system channel when bot can send to it", () => {
    const sys = makeChannel({ id: "sys-1", canSend: true });
    const guild = makeGuild({
      systemChannel: sys,
      channels: [sys, makeChannel({ id: "other", canSend: true })]
    });
    expect(findWelcomeChannel(guild as never)?.id).toBe("sys-1");
  });

  it("falls back to first sendable text channel when system channel cannot be sent to", () => {
    const sysNoSend = makeChannel({ id: "sys-locked", canSend: false });
    const fallback = makeChannel({ id: "general", canSend: true, position: 0 });
    const later = makeChannel({ id: "off-topic", canSend: true, position: 5 });
    const guild = makeGuild({
      systemChannel: sysNoSend,
      channels: [later, fallback, sysNoSend]
    });
    expect(findWelcomeChannel(guild as never)?.id).toBe("general");
  });

  it("returns null when no channel is sendable", () => {
    const guild = makeGuild({
      systemChannel: null,
      channels: [
        makeChannel({ id: "a", canSend: false }),
        makeChannel({ id: "b", canSend: false })
      ]
    });
    expect(findWelcomeChannel(guild as never)).toBeNull();
  });

  it("returns null when no system channel and no sendable text channels exist", () => {
    const guild = makeGuild({
      systemChannel: null,
      channels: [makeChannel({ id: "voice-only", type: ChannelType.GuildVoice })]
    });
    expect(findWelcomeChannel(guild as never)).toBeNull();
  });
});
