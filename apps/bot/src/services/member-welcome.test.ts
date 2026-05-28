import { describe, it, expect } from "vitest";
import { buildMemberWelcomeMessage, parseRolePickCustomId, ROLE_PICK_PREFIX } from "./member-welcome";
import type { GuildMember } from "discord.js";

describe("parseRolePickCustomId", () => {
  it("parses valid role IDs", () => {
    expect(parseRolePickCustomId(`${ROLE_PICK_PREFIX}MT`)).toBe("MT");
    expect(parseRolePickCustomId(`${ROLE_PICK_PREFIX}D3`)).toBe("D3");
    expect(parseRolePickCustomId(`${ROLE_PICK_PREFIX}H1`)).toBe("H1");
  });

  it("rejects unknown game roles", () => {
    expect(parseRolePickCustomId(`${ROLE_PICK_PREFIX}TANK`)).toBeNull();
    expect(parseRolePickCustomId(`${ROLE_PICK_PREFIX}d1`)).toBeNull(); // case-sensitive
    expect(parseRolePickCustomId(`${ROLE_PICK_PREFIX}D5`)).toBeNull(); // out of range
  });

  it("rejects strings without the prefix", () => {
    expect(parseRolePickCustomId("vote:abc:0:yes")).toBeNull();
    expect(parseRolePickCustomId("MT")).toBeNull();
    expect(parseRolePickCustomId("")).toBeNull();
  });
});

describe("buildMemberWelcomeMessage", () => {
  const fakeMember = {
    id: "user-123",
    displayName: "テストユーザー",
  } as GuildMember;

  it("includes the member display name in the title", () => {
    const msg = buildMemberWelcomeMessage(fakeMember);
    const data = msg.embeds[0].toJSON();
    expect(data.title).toContain("テストユーザー");
    expect(data.title).toMatch(/ようこそ/);
  });

  it("mentions the joiner in content (so they get a ping)", () => {
    const msg = buildMemberWelcomeMessage(fakeMember);
    expect(msg.content).toBe(`<@user-123>`);
  });

  it("renders 2 ActionRows of 4 buttons each (8 game roles total)", () => {
    const msg = buildMemberWelcomeMessage(fakeMember);
    expect(msg.components).toHaveLength(2);
    const row0 = msg.components[0].toJSON() as { components: { custom_id: string; label: string }[] };
    const row1 = msg.components[1].toJSON() as { components: { custom_id: string; label: string }[] };
    expect(row0.components.map((c) => c.label)).toEqual(["MT", "ST", "H1", "H2"]);
    expect(row1.components.map((c) => c.label)).toEqual(["D1", "D2", "D3", "D4"]);
  });

  it("each button customId is 'role-pick:<role>'", () => {
    const msg = buildMemberWelcomeMessage(fakeMember);
    const all = [
      ...(msg.components[0].toJSON() as { components: { custom_id: string }[] }).components,
      ...(msg.components[1].toJSON() as { components: { custom_id: string }[] }).components,
    ];
    expect(all.map((c) => c.custom_id)).toEqual([
      "role-pick:MT", "role-pick:ST", "role-pick:H1", "role-pick:H2",
      "role-pick:D1", "role-pick:D2", "role-pick:D3", "role-pick:D4",
    ]);
  });

  it("tank/healer/dps buttons use distinct ButtonStyles for color coding", () => {
    const msg = buildMemberWelcomeMessage(fakeMember);
    const all = [
      ...(msg.components[0].toJSON() as { components: { custom_id: string; style: number }[] }).components,
      ...(msg.components[1].toJSON() as { components: { custom_id: string; style: number }[] }).components,
    ];
    // Tanks (MT, ST): Primary (1) = blurple
    // Healers (H1, H2): Success (3) = green
    // DPS (D1-D4): Danger (4) = red
    const byId = Object.fromEntries(all.map((c) => [c.custom_id, c.style]));
    expect(byId["role-pick:MT"]).toBe(byId["role-pick:ST"]); // both tank → same style
    expect(byId["role-pick:H1"]).toBe(byId["role-pick:H2"]);
    expect(byId["role-pick:D1"]).toBe(byId["role-pick:D4"]);
    expect(byId["role-pick:MT"]).not.toBe(byId["role-pick:H1"]);
    expect(byId["role-pick:H1"]).not.toBe(byId["role-pick:D1"]);
  });
});
