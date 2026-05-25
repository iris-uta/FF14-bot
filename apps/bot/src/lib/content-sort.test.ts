import { describe, it, expect } from "vitest";
import { sortByPatch } from "./content-sort";
import type { Content } from "@ff14kotei/schema";

const baseContent: Omit<Content, "id" | "patch"> = {
  displayName: "x",
  shortName: "X",
  type: "ultimate",
  phases: [{ id: "p1", name: "p1", order: 1, videos: [], strategies: [], tips: [] }],
  macros: [],
  recruitmentTemplates: [],
  references: { urls: [] },
};

function mk(id: string, patch?: string): Content {
  return { ...baseContent, id, patch };
}

describe("sortByPatch", () => {
  it("sorts by patch number ascending", () => {
    const result = sortByPatch([mk("c", "5.11"), mk("a", "4.11"), mk("b", "4.31")]);
    expect(result.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("compares within same major (4.11 < 4.31 < 4.51)", () => {
    const result = sortByPatch([mk("a", "4.31"), mk("b", "4.51"), mk("c", "4.11")]);
    expect(result.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("handles unequal segment counts (7.5 < 7.51)", () => {
    const result = sortByPatch([mk("a", "7.51"), mk("b", "7.5")]);
    expect(result.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("treats unknown patch as last (sorts to end)", () => {
    const result = sortByPatch([mk("known", "5.0"), mk("unknown"), mk("anotherKnown", "6.0")]);
    expect(result.map((c) => c.id)).toEqual(["known", "anotherKnown", "unknown"]);
  });

  it("breaks ties by id alphabetically", () => {
    const result = sortByPatch([mk("zzz", "5.0"), mk("aaa", "5.0")]);
    expect(result.map((c) => c.id)).toEqual(["aaa", "zzz"]);
  });

  it("matches real Ultimate implementation order (ucob → uwu → tea → dsr → top → fru → dmu)", () => {
    const result = sortByPatch([
      mk("top", "6.31"),
      mk("dsr", "6.11"),
      mk("uwu", "4.31"),
      mk("ucob", "4.11"),
      mk("dmu", "7.51"),
      mk("tea", "5.11"),
      mk("fru", "7.11"),
    ]);
    expect(result.map((c) => c.id)).toEqual(["ucob", "uwu", "tea", "dsr", "top", "fru", "dmu"]);
  });

  it("does not mutate input array", () => {
    const input = [mk("b", "5.0"), mk("a", "4.0")];
    sortByPatch(input);
    expect(input.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("handles double-digit major versions correctly (10.0 > 9.0)", () => {
    const result = sortByPatch([mk("a", "10.0"), mk("b", "9.0")]);
    expect(result.map((c) => c.id)).toEqual(["b", "a"]);
  });
});
