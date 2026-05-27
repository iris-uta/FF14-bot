import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "./static-info";

describe("/static-info command — shape", () => {
  it("has correct name", () => {
    expect(data.name).toBe("static-info");
  });

  it("has ja localization", () => {
    expect(data.toJSON().name_localizations?.ja).toBe("固定情報");
  });

  it("uses SendMessages permission (read-only, everyone)", () => {
    const json = data.toJSON();
    expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.SendMessages));
  });

  it("has optional 'name' option with autocomplete", () => {
    const json = data.toJSON();
    const opt = json.options?.find((o: { name: string }) => o.name === "name");
    expect(opt).toMatchObject({ required: false, autocomplete: true });
  });

  it("has optional 'public' boolean option", () => {
    const json = data.toJSON();
    const opt = json.options?.find((o: { name: string }) => o.name === "public") as
      | { type?: number; required?: boolean }
      | undefined;
    expect(opt?.required).toBeFalsy();
    // 5 = BOOLEAN per Discord API
    expect(opt?.type).toBe(5);
  });
});
