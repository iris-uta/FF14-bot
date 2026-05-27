import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "./unschedule";

describe("/unschedule command — shape", () => {
  it("has correct name", () => {
    expect(data.name).toBe("cancel");
  });

  it("requires Manage Events permission (leader-only by default)", () => {
    const json = data.toJSON();
    expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.ManageEvents));
  });

  it("has required 'id' option with autocomplete", () => {
    const json = data.toJSON();
    const opt = json.options?.find((o: { name: string }) => o.name === "id");
    expect(opt).toMatchObject({ required: true, autocomplete: true });
  });
});
