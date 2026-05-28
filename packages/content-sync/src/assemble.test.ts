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
    templates: []
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
      { id: "fru", displayName: "絶もうひとつの未来", shortName: "FRU", type: "ultimate", patch: "7.11" }
    ];
    sheet.phases = [
      { content_id: "fru", phase_id: "p1", name: "Fatebreaker", order: "0", description: "" }
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
      { id: "fru", displayName: "絶もうひとつの未来", shortName: "FRU", type: "ultimate", patch: "" }
    ];
    sheet.phases = [
      { content_id: "fru", phase_id: "p1", name: "P1", order: "0", description: "" },
      { content_id: "fru", phase_id: "p2", name: "P2", order: "1", description: "" }
    ];
    sheet.videos = [
      { content_id: "fru", phase_id: "p1", title: "P1 解説", url: "https://example.com/v1", author: "Alice" },
      { content_id: "fru", phase_id: "p2", title: "P2 解説", url: "https://example.com/v2", author: "" }
    ];
    sheet.mitigations = [
      { content_id: "fru", phase_id: "p1", name: "P1 軽減", url: "https://example.com/m1", copyable: "true" }
    ];
    sheet.strategies = [
      { content_id: "fru", phase_id: "p2", id: "ast-shiki", name: "アスト式", description: "" }
    ];
    sheet.tips = [
      { content_id: "fru", phase_id: "p1", tip: "tip A" },
      { content_id: "fru", phase_id: "p1", tip: "tip B" },
      { content_id: "fru", phase_id: "p2", tip: "tip C" }
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
      { id: "bad", displayName: "x", shortName: "x", type: "INVALID", patch: "" },
      // Valid
      { id: "fru", displayName: "FRU", shortName: "FRU", type: "ultimate", patch: "" }
    ];
    sheet.phases = [
      { content_id: "fru", phase_id: "p1", name: "P1", order: "0", description: "" }
    ];
    const r = assembleContents(sheet);
    expect(r.contents.map((c) => c.id)).toEqual(["fru"]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].contentId).toBe("bad");
    expect(r.errors[0].message).toContain("type");
  });

  it("attaches macros + recruitmentTemplates to the parent content", () => {
    const sheet = emptySheet();
    sheet.contents = [
      { id: "fru", displayName: "FRU", shortName: "FRU", type: "ultimate", patch: "" }
    ];
    sheet.phases = [
      { content_id: "fru", phase_id: "p1", name: "P1", order: "0", description: "" }
    ];
    sheet.macros = [
      { content_id: "fru", source: "@alice", url: "https://example.com/m1.txt", text: "/macroicon ..." }
    ];
    sheet.templates = [
      { content_id: "fru", template: "募集中! {date}", variables: "date, time" }
    ];
    const r = assembleContents(sheet);
    expect(r.errors).toEqual([]);
    const c = r.contents[0];
    expect(c.macros).toHaveLength(1);
    expect(c.macros[0].source).toBe("@alice");
    expect(c.recruitmentTemplates).toHaveLength(1);
    expect(c.recruitmentTemplates[0].variables).toEqual(["date", "time"]);
  });

  it("skips rows whose content_id is blank", () => {
    const sheet = emptySheet();
    sheet.contents = [{ id: "", displayName: "x", shortName: "x", type: "ultimate", patch: "" }];
    const r = assembleContents(sheet);
    expect(r.contents).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("reads overview_guide_url + overview_bis_url into Content.overview", () => {
    const sheet = emptySheet();
    sheet.contents = [{
      id: "fru", displayName: "FRU", shortName: "FRU", type: "ultimate",
      patch: "",
      overview_guide_url: "https://na.finalfantasyxiv.com/lodestone/character/123/blog/4567",
      overview_bis_url: "https://etro.gg/gearset/abc"
    }];
    sheet.phases = [{ content_id: "fru", phase_id: "p1", name: "P1", order: "0", description: "" }];
    const r = assembleContents(sheet);
    expect(r.errors).toEqual([]);
    expect(r.contents[0].overview?.guideUrl).toBe("https://na.finalfantasyxiv.com/lodestone/character/123/blog/4567");
    expect(r.contents[0].overview?.bisUrl).toBe("https://etro.gg/gearset/abc");
  });

  it("reads macros.phase_id into MacroRef.phaseId (empty → undefined)", () => {
    const sheet = emptySheet();
    sheet.contents = [{ id: "fru", displayName: "FRU", shortName: "FRU", type: "ultimate", patch: "" }];
    sheet.phases = [{ content_id: "fru", phase_id: "p1", name: "P1", order: "0", description: "" }];
    sheet.macros = [
      { content_id: "fru", phase_id: "p1", source: "@alice", url: "https://e.com/a", text: "" },
      { content_id: "fru", phase_id: "",   source: "@bob",   url: "https://e.com/b", text: "" }
    ];
    const r = assembleContents(sheet);
    expect(r.errors).toEqual([]);
    expect(r.contents[0].macros[0].phaseId).toBe("p1");
    expect(r.contents[0].macros[1].phaseId).toBeUndefined();
  });
});
