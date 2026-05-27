import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "./progress";

describe("/progress command — shape", () => {
  it("has correct name + ja localization", () => {
    expect(data.name).toBe("progress");
    expect(data.toJSON().name_localizations?.ja).toBe("進行記録");
  });

  it("uses SendMessages permission (everyone can log)", () => {
    expect(data.toJSON().default_member_permissions).toBe(String(PermissionFlagsBits.SendMessages));
  });

  it("has 'mark', 'show', 'remove' subcommands", () => {
    const names = data.toJSON().options?.map((o: { name: string }) => o.name);
    expect(names).toEqual(expect.arrayContaining(["mark", "show", "remove"]));
  });

  it("'mark' requires status with 4 choices", () => {
    const sub = data.toJSON().options?.find((o: { name: string }) => o.name === "mark") as
      | { options?: { name: string; required?: boolean; choices?: { value: string }[] }[] }
      | undefined;
    const status = sub?.options?.find((o) => o.name === "status");
    expect(status?.required).toBe(true);
    expect(status?.choices?.map((c) => c.value).sort()).toEqual(
      ["cleared", "first-clear", "note", "reached"].sort()
    );
  });

  it("'mark' has optional 'phase' with autocomplete + 'static' + 'note' + 'date'", () => {
    const sub = data.toJSON().options?.find((o: { name: string }) => o.name === "mark") as
      | { options?: { name: string; required?: boolean; autocomplete?: boolean }[] }
      | undefined;
    expect(sub?.options?.find((o) => o.name === "phase")?.autocomplete).toBe(true);
    expect(sub?.options?.find((o) => o.name === "phase")?.required).toBeFalsy();
    expect(sub?.options?.find((o) => o.name === "static")?.autocomplete).toBe(true);
    expect(sub?.options?.find((o) => o.name === "note")).toBeDefined();
    expect(sub?.options?.find((o) => o.name === "date")).toBeDefined();
  });

  it("'show' has optional 'twitter' boolean", () => {
    const sub = data.toJSON().options?.find((o: { name: string }) => o.name === "show") as
      | { options?: { name: string; type?: number }[] }
      | undefined;
    expect(sub?.options?.find((o) => o.name === "twitter")?.type).toBe(5); // BOOLEAN
  });

  it("'remove' requires 'id' option", () => {
    const sub = data.toJSON().options?.find((o: { name: string }) => o.name === "remove") as
      | { options?: { name: string; required?: boolean }[] }
      | undefined;
    expect(sub?.options?.find((o) => o.name === "id")?.required).toBe(true);
  });
});
