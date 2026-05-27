import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "./schedule";

describe("/schedule command — shape", () => {
  it("has correct name", () => {
    expect(data.name).toBe("book");
  });

  it("requires Manage Events permission (leader-only by default)", () => {
    const json = data.toJSON();
    expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.ManageEvents));
  });

  it("has required 'when' option", () => {
    const json = data.toJSON();
    const opt = json.options?.find((o: { name: string }) => o.name === "when");
    expect(opt).toMatchObject({ required: true });
  });

  it("has optional 'content' option with autocomplete", () => {
    const json = data.toJSON();
    const opt = json.options?.find((o: { name: string }) => o.name === "content");
    expect(opt).toMatchObject({ required: false, autocomplete: true });
  });

  it("has optional integer 'notify_minutes_before' with range 0-1440", () => {
    const json = data.toJSON();
    const opt = json.options?.find((o: { name: string }) => o.name === "notify_minutes_before") as {
      min_value?: number;
      max_value?: number;
    } | undefined;
    expect(opt).toMatchObject({ min_value: 0, max_value: 1440 });
  });
});
