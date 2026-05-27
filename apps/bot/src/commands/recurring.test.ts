import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "./recurring";

describe("/recurring command — shape", () => {
  it("has correct name + ja localization", () => {
    expect(data.name).toBe("recurring");
    expect(data.toJSON().name_localizations?.ja).toBe("定期予定");
  });

  it("requires ManageEvents (固定リーダー級)", () => {
    expect(data.toJSON().default_member_permissions).toBe(
      String(PermissionFlagsBits.ManageEvents)
    );
  });

  it("has 'set', 'list', 'remove' subcommands", () => {
    const names = data.toJSON().options?.map((o: { name: string }) => o.name);
    expect(names).toEqual(expect.arrayContaining(["set", "list", "remove"]));
  });

  it("'set' has required day (with 7 weekday choices) + time", () => {
    const sub = data.toJSON().options?.find((o: { name: string }) => o.name === "set") as
      | { options?: { name: string; required?: boolean; choices?: { value: number }[] }[] }
      | undefined;
    const day = sub?.options?.find((o) => o.name === "day");
    const time = sub?.options?.find((o) => o.name === "time");
    expect(day?.required).toBe(true);
    expect(day?.choices?.map((c) => c.value).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(time?.required).toBe(true);
  });

  it("'remove' requires id with autocomplete", () => {
    const sub = data.toJSON().options?.find((o: { name: string }) => o.name === "remove") as
      | { options?: { name: string; required?: boolean; autocomplete?: boolean }[] }
      | undefined;
    const id = sub?.options?.find((o) => o.name === "id");
    expect(id).toMatchObject({ required: true, autocomplete: true });
  });

  it("'list' takes no required options", () => {
    const sub = data.toJSON().options?.find((o: { name: string }) => o.name === "list") as
      | { options?: { name: string; required?: boolean }[] }
      | undefined;
    expect(sub?.options?.every((o) => !o.required) ?? true).toBe(true);
  });
});
