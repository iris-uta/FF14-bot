import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "./from-chouseisan";

describe("/from-chouseisan command — shape", () => {
  it("has correct name + ja localization", () => {
    expect(data.name).toBe("from-chouseisan");
    expect(data.toJSON().name_localizations?.ja).toBe("調整さん取込");
  });

  it("requires ManageEvents (creates schedules)", () => {
    expect(data.toJSON().default_member_permissions).toBe(
      String(PermissionFlagsBits.ManageEvents)
    );
  });

  it("has required 'url' option", () => {
    const url = data.toJSON().options?.find((o: { name: string }) => o.name === "url") as
      | { required?: boolean }
      | undefined;
    expect(url?.required).toBe(true);
  });

  it("has optional 'default_time', 'mention', 'notify_minutes_before'", () => {
    const opts = data.toJSON().options ?? [];
    const names = opts.map((o: { name: string }) => o.name);
    expect(names).toEqual(expect.arrayContaining(["default_time", "mention", "notify_minutes_before"]));
    const optional = opts.filter((o: { name: string; required?: boolean }) => o.name !== "url");
    expect(optional.every((o: { required?: boolean }) => !o.required)).toBe(true);
  });
});
