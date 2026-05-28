import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "./role-pick";

describe("/role-pick command — shape", () => {
  it("has correct name + ja localization", () => {
    expect(data.name).toBe("role-pick");
    expect(data.toJSON().name_localizations?.ja).toBe("ロール選択");
  });

  it("uses SendMessages perm (everyone can pick their own role)", () => {
    expect(data.toJSON().default_member_permissions).toBe(
      String(PermissionFlagsBits.SendMessages)
    );
  });

  it("has optional 'public' boolean option", () => {
    const opt = data.toJSON().options?.find((o: { name: string }) => o.name === "public") as
      | { type?: number; required?: boolean }
      | undefined;
    expect(opt?.type).toBe(5); // BOOLEAN
    expect(opt?.required).toBeFalsy();
  });
});
