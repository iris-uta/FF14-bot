import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "./quickstart";

describe("/quickstart command — shape", () => {
  it("has correct name + ja localization", () => {
    expect(data.name).toBe("quickstart");
    expect(data.toJSON().name_localizations?.ja).toBe("はじめに");
  });

  it("uses SendMessages permission (everyone can use)", () => {
    expect(data.toJSON().default_member_permissions).toBe(
      String(PermissionFlagsBits.SendMessages)
    );
  });

  it("has optional 'public' boolean option (default ephemeral)", () => {
    const opts = data.toJSON().options ?? [];
    const pub = opts.find((o: { name: string }) => o.name === "public") as
      | { type?: number; required?: boolean }
      | undefined;
    expect(pub).toBeDefined();
    expect(pub?.required).toBeFalsy();
    expect(pub?.type).toBe(5); // BOOLEAN
  });
});
