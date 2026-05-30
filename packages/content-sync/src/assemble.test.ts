import { describe, it, expect } from "vitest";
import { assembleContents, type SheetData } from "./assemble";

function emptySheet(): SheetData {
  return {
    contents: [],
    phases: [],
    videos: [],
    mitigations: [],
    strategies: [],
    tips: [],
    macros: [],
    templates: [],
    references: [],
  };
}

describe("assembleContents", () => {
  it("returns nothing for an empty sheet", () => {
    const r = assembleContents(emptySheet());
    expect(r.contents).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("builds a minimal valid content", () => {
    const sheet = emptySheet();
    sheet.contents = [
      { id: "fru", displayName: "絶もうひとつの未来", shortName: "FRU", type: "ultimate", patch: "7.11", references_primary: "" },
    ];
    sheet.phases = [
      { content_id: "fru", phase_id: "p1", name: "Fatebreaker", order: "0", description: "" },
    ];
    const r = assembleContents(sheet);
    expect(r.errors).toEqual([]);
    expect(r.contents).toHaveLength(1);
    expect(r.contents[0].id).toBe("fru");
    expect(r.contents[0].phases).toHaveLength(1);
    expect(r.contents[0].phases[0].name).toBe("Fatebreaker");
  });

  it("attaches videos / mitigations / strategies / tips to the right phase", () => {
    const sheet = emptySheet();
    sheet.contents = [
      { id: "fru", displayName: "絶もうひとつの未来", shortName: "FRU", type: "ultimate", patch: "", references_primary: "" },
    ];
    sheet.phases = [
      { content_id: "fru", phase_id: "p1", name: "P1", order: "0", description: "" },
      { content_id: "fru", phase_id: "p2", name: "P2", order: "1", description: "" },
    ];
    sheet.videos = [
      { content_id: "fru", phase_id: "p1", title: "P1 解説", url: "https://example.com/v1", author: "Alice" },
      { content_id: "fru", phase_id: "p2", title: "P2 解説", url: "https://example.com/v2", author: "" },
    ];
    sheet.mitigations = [
      { content_id: "fru", phase_id: "p1", name: "P1 軽減", url: "https://example.com/m1", copyable: "true" },
    ];
    sheet.strategies = [
      { content_id: "fru", phase_id: "p2", id: "ast-shiki", name: "アスト式", description: "" },
    ];
    sheet.tips = [
      { content_id: "fru", phase_id: "p1", tip: "tip A" },
      { content_id: "fru", phase_id: "p1", tip: "tip B" },
      { content_id: "fru", phase_id: "p2", tip: "tip C" },
    ];
    const r = assembleContents(sheet);
    expect(r.errors).toEqual([]);
    const c = r.contents[0];
    expect(c.phases[0].videos[0].title).toBe("P1 解説");
    expect(c.phases[0].videos[0].author).toBe("Alice");
    expect(c.phases[0].mitigation?.copyable).toBe(true);
    expect(c.phases[0].tips).toEqual(["tip A", "tip B"]);
    expect(c.phases[1].videos[0].author).toBeUndefined(); // empty string → undefined
    expect(c.phases[1].strategies).toHaveLength(1);
    expect(c.phases[1].strategies[0].name).toBe("アスト式");
    expect(c.phases[1].tips).toEqual(["tip C"]);
  });

  it("collects Zod errors per-content without crashing", () => {
    const sheet = emptySheet();
    sheet.contents = [
      // Invalid: type must be one of the enum values
      { id: "bad", displayName: "x", shortName: "x", type: "INVALID", patch: "", references_primary: "" },
      // Valid
      { id: "fru", displayName: "FRU", shortName: "FRU", type: "ultimate", patch: "", references_primary: "" },
    ];
    sheet.phases = [
      { content_id: "fru", phase_id: "p1", name: "P1", order: "0", description: "" },
    ];
    const r = assembleContents(sheet);
    expect(r.contents.map((c) => c.id)).toEqual(["fru"]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].contentId).toBe("bad");
    expect(r.errors[0].message).toContain("type");
  });

  it("attaches macros + recruitmentTemplates + references to the parent content", () => {
    const sheet = emptySheet();
    sheet.contents = [
      { id: "fru", displayName: "FRU", shortName: "FRU", type: "ultimate", patch: "", references_primary: "りりーどーる" },
    ];
    sheet.phases = [
      { content_id: "fru", phase_id: "p1", name: "P1", order: "0", description: "" },
    ];
    sheet.macros = [
      { content_id: "fru", source: "@alice", url: "https://example.com/m1.txt", text: "/macroicon ..." },
    ];
    sheet.templates = [
      { content_id: "fru", template: "募集中! {date}", variables: "date, time" },
    ];
    sheet.references = [
      { content_id: "fru", url: "https://example.com/ref1" },
      { content_id: "fru", url: "https://example.com/ref2" },
    ];
    const r = assembleContents(sheet);
    expect(r.errors).toEqual([]);
    const c = r.contents[0];
    expect(c.macros).toHaveLength(1);
    expect(c.macros[0].source).toBe("@alice");
    expect(c.recruitmentTemplates).toHaveLength(1);
    expect(c.recruitmentTemplates[0].variables).toEqual(["date", "time"]);
    expect(c.references.primary).toBe("りりーどーる");
    expect(c.references.urls).toEqual([
      "https://example.com/ref1",
      "https://example.com/ref2",
    ]);
  });

  it("parses the macros `phases` column (CSV of phase ids) into an array", () => {
    const sheet = emptySheet();
    sheet.contents = [
      { id: "m6s", displayName: "M6S", shortName: "M6S", type: "savage", patch: "", references_primary: "" },
    ];
    sheet.phases = [
      { content_id: "m6s", phase_id: "p1-front", name: "前半", order: "1", description: "" },
      { content_id: "m6s", phase_id: "p2-back", name: "後半", order: "2", description: "" },
    ];
    sheet.macros = [
      { content_id: "m6s", source: "前半 macro", url: "https://e.com/1", text: "", phases: "p1-front" },
      { content_id: "m6s", source: "共通 macro", url: "https://e.com/2", text: "", phases: "p1-front, p2-back" },
      { content_id: "m6s", source: "no phases", url: "https://e.com/3", text: "" },
    ];
    const r = assembleContents(sheet);
    expect(r.errors).toEqual([]);
    const c = r.contents[0];
    expect(c.macros[0].phases).toEqual(["p1-front"]);
    expect(c.macros[1].phases).toEqual(["p1-front", "p2-back"]); // split on comma + space
    expect(c.macros[2].phases).toBeUndefined();                  // empty/absent → omitted (regex fallback)
  });

  it("rejects a content whose macro phases reference an unknown phase id", () => {
    const sheet = emptySheet();
    sheet.contents = [
      { id: "m6s", displayName: "M6S", shortName: "M6S", type: "savage", patch: "", references_primary: "" },
    ];
    sheet.phases = [
      { content_id: "m6s", phase_id: "p1-front", name: "前半", order: "1", description: "" },
    ];
    sheet.macros = [
      { content_id: "m6s", source: "typo", url: "https://e.com/1", text: "", phases: "p2-typo" },
    ];
    const r = assembleContents(sheet);
    expect(r.contents).toEqual([]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain("p2-typo");
  });

  it("reads the status column (absent/blank → omitted=published, 'testing' → testing)", () => {
    const sheet = emptySheet();
    sheet.contents = [
      // no status column at all (un-migrated sheet) → omitted → published
      { id: "fru", displayName: "FRU", shortName: "FRU", type: "ultimate", patch: "", references_primary: "" },
      // explicit testing
      { id: "m1s", displayName: "M1S", shortName: "M1S", type: "savage", patch: "", references_primary: "", status: "testing" },
      // blank status cell → omitted → published
      { id: "p1s", displayName: "P1S", shortName: "P1S", type: "savage", patch: "", references_primary: "", status: "" },
    ];
    sheet.phases = [
      { content_id: "fru", phase_id: "p1", name: "P1", order: "0", description: "" },
      { content_id: "m1s", phase_id: "p1", name: "P1", order: "0", description: "" },
      { content_id: "p1s", phase_id: "p1", name: "P1", order: "0", description: "" },
    ];
    const r = assembleContents(sheet);
    expect(r.errors).toEqual([]);
    const status = Object.fromEntries(r.contents.map((c) => [c.id, c.status]));
    expect(status.fru).toBeUndefined();   // absent column → omitted (published)
    expect(status.m1s).toBe("testing");
    expect(status.p1s).toBeUndefined();   // blank cell → omitted (published)
  });

  it("skips rows whose content_id is blank", () => {
    const sheet = emptySheet();
    sheet.contents = [{ id: "", displayName: "x", shortName: "x", type: "ultimate", patch: "", references_primary: "" }];
    const r = assembleContents(sheet);
    expect(r.contents).toEqual([]);
    expect(r.errors).toEqual([]);
  });
});
