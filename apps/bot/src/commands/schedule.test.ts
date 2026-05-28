import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "./schedule";

describe("/book command — shape (post wizard refactor)", () => {
  it("has correct name", () => {
    expect(data.name).toBe("book");
  });

  it("requires Manage Events permission (leader-only by default)", () => {
    const json = data.toJSON();
    expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.ManageEvents));
  });

  it("does NOT have a strict-text 'when' option (date/time picked via wizard)", () => {
    const json = data.toJSON();
    const opt = json.options?.find((o: { name: string }) => o.name === "when");
    expect(opt).toBeUndefined();
  });

  it("has optional 'content' option with autocomplete", () => {
    const json = data.toJSON();
    const opt = json.options?.find((o: { name: string }) => o.name === "content");
    expect(opt).toMatchObject({ required: false, autocomplete: true });
  });

  it("has optional integer 'notify_minutes_before' with range 0-1440", () => {
    const json = data.toJSON();
    const opt = json.options?.find(
      (o: { name: string }) => o.name === "notify_minutes_before"
    ) as { min_value?: number; max_value?: number } | undefined;
    expect(opt).toMatchObject({ min_value: 0, max_value: 1440 });
  });

  it("every option is now optional (everything fillable in wizard)", () => {
    const json = data.toJSON();
    for (const opt of json.options ?? []) {
      expect((opt as { required?: boolean }).required ?? false).toBe(false);
    }
  });
});
