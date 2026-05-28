import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "./static-init";

describe("/setup (旧 /static-init) — shape", () => {
  it("has correct name + ja localization", () => {
    expect(data.name).toBe("setup");
    expect(data.toJSON().name_localizations?.ja).toBe("固定作成");
  });

  it("requires ManageChannels (leader-only)", () => {
    expect(data.toJSON().default_member_permissions).toBe(
      String(PermissionFlagsBits.ManageChannels)
    );
  });

  it("has optional 'content' option with autocomplete (wizard fills it when missing)", () => {
    const json = data.toJSON();
    const content = json.options?.find((o: { name: string }) => o.name === "content") as
      | { required?: boolean; autocomplete?: boolean }
      | undefined;
    expect(content?.autocomplete).toBe(true);
    expect(content?.required).toBeFalsy();
  });

  it("has required 'name' option", () => {
    const json = data.toJSON();
    const name = json.options?.find((o: { name: string }) => o.name === "name") as
      | { required?: boolean }
      | undefined;
    expect(name?.required).toBe(true);
  });

  it("has optional 'type' filter and 'mode' choices", () => {
    const json = data.toJSON();
    const type = json.options?.find((o: { name: string }) => o.name === "type");
    const mode = json.options?.find((o: { name: string }) => o.name === "mode") as
      | { choices?: { value: string }[] }
      | undefined;
    expect(type).toBeDefined();
    expect(mode?.choices?.map((c) => c.value).sort()).toEqual(["minimal", "race", "standard"]);
  });

  it("has optional 'members' free-text option", () => {
    const json = data.toJSON();
    const m = json.options?.find((o: { name: string }) => o.name === "members") as
      | { required?: boolean }
      | undefined;
    expect(m?.required).toBeFalsy();
  });
});
