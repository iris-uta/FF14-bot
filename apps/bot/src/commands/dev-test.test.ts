import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "./dev-test";

describe("/dev-test command — shape", () => {
  it("has correct name + ja localization", () => {
    expect(data.name).toBe("dev-test");
    expect(data.toJSON().name_localizations?.ja).toBe("開発テスト");
  });

  it("requires Administrator (hidden from non-admins)", () => {
    expect(data.toJSON().default_member_permissions).toBe(
      String(PermissionFlagsBits.Administrator)
    );
  });

  it("has 'create', 'cleanup', 'list' subcommands", () => {
    const names = data.toJSON().options?.map((o: { name: string }) => o.name);
    expect(names).toEqual(expect.arrayContaining(["create", "cleanup", "list"]));
  });

  it("'create' has optional 'filter' string option", () => {
    const sub = data.toJSON().options?.find((o: { name: string }) => o.name === "create") as
      | { options?: { name: string; required?: boolean; type?: number }[] }
      | undefined;
    const filter = sub?.options?.find((o) => o.name === "filter");
    expect(filter?.required).toBeFalsy();
    expect(filter?.type).toBe(3); // STRING
  });

  it("'cleanup' and 'list' take no options", () => {
    const cleanup = data.toJSON().options?.find((o: { name: string }) => o.name === "cleanup") as
      | { options?: unknown[] }
      | undefined;
    const list = data.toJSON().options?.find((o: { name: string }) => o.name === "list") as
      | { options?: unknown[] }
      | undefined;
    expect(cleanup?.options ?? []).toHaveLength(0);
    expect(list?.options ?? []).toHaveLength(0);
  });
});
