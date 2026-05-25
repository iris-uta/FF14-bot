import { describe, it, expect } from "vitest";
import {
  parseMembers,
  checkRoleUniqueness,
  MemberSpecParseError,
  VALID_ROLES,
} from "./members-parser";

describe("parseMembers", () => {
  it("parses a single entry", () => {
    expect(parseMembers("<@111111111111111111> MT PLD")).toEqual([
      { userId: "111111111111111111", role: "MT", job: "PLD" },
    ]);
  });

  it("parses multiple entries separated by comma", () => {
    const result = parseMembers("<@111111111111111111> MT PLD, <@222222222222222222> ST GNB, <@333333333333333333> H1 SCH");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ userId: "111111111111111111", role: "MT", job: "PLD" });
    expect(result[1]).toEqual({ userId: "222222222222222222", role: "ST", job: "GNB" });
    expect(result[2]).toEqual({ userId: "333333333333333333", role: "H1", job: "SCH" });
  });

  it("handles <@!USERID> nickname-mention format", () => {
    expect(parseMembers("<@!111111111111111111> D2 SAM")).toEqual([
      { userId: "111111111111111111", role: "D2", job: "SAM" },
    ]);
  });

  it("uppercases role and job", () => {
    expect(parseMembers("<@111111111111111111> mt pld")[0]).toEqual({ userId: "111111111111111111", role: "MT", job: "PLD" });
  });

  it("returns [] for empty input", () => {
    expect(parseMembers("")).toEqual([]);
    expect(parseMembers("   ")).toEqual([]);
  });

  it("trims whitespace around entries", () => {
    const result = parseMembers("  <@111111111111111111> MT PLD ,   <@222222222222222222> ST GNB  ");
    expect(result).toHaveLength(2);
  });

  it("throws on invalid format (no mention)", () => {
    expect(() => parseMembers("@taro MT PLD")).toThrow(MemberSpecParseError);
  });

  it("throws on invalid role", () => {
    expect(() => parseMembers("<@111111111111111111> XX PLD")).toThrow(/不正なロール/);
  });

  it("throws on missing job", () => {
    expect(() => parseMembers("<@111111111111111111> MT")).toThrow(MemberSpecParseError);
  });

  it("throws on invalid user ID (too short)", () => {
    expect(() => parseMembers("<@123> MT PLD")).toThrow(MemberSpecParseError);
  });

  it("accepts all 8 valid roles", () => {
    const all = VALID_ROLES.map((r, i) => `<@111111111111111111> ${r} PLD`).join(", ");
    // can't have duplicate user IDs causing slots issues - that's a separate concern
    // just verify the parser allows all valid roles
    const result = parseMembers(all);
    expect(result).toHaveLength(8);
    expect(result.map((m) => m.role).sort()).toEqual([...VALID_ROLES].sort());
  });
});

describe("checkRoleUniqueness", () => {
  it("ok when all roles unique", () => {
    const members = [
      { userId: "1", role: "MT" as const, job: "PLD" },
      { userId: "2", role: "ST" as const, job: "GNB" },
    ];
    expect(checkRoleUniqueness(members)).toEqual({ ok: true, duplicateRoles: [] });
  });

  it("flags duplicate roles", () => {
    const members = [
      { userId: "1", role: "MT" as const, job: "PLD" },
      { userId: "2", role: "MT" as const, job: "WAR" },
      { userId: "3", role: "H1" as const, job: "SCH" },
      { userId: "4", role: "H1" as const, job: "WHM" },
    ];
    const result = checkRoleUniqueness(members);
    expect(result.ok).toBe(false);
    expect(result.duplicateRoles.sort()).toEqual(["H1", "MT"]);
  });
});
