import { describe, it, expect } from "vitest";
import { isContentPublished, type Content } from "@ff14kotei/schema";
import { disassembleContents, rowsToCsv, TAB_HEADERS } from "./disassemble";
import { assembleContents } from "./assemble";

function makeContent(overrides: Partial<Content> = {}): Content {
  return {
    id: "fru",
    displayName: "絶もうひとつの未来",
    shortName: "FRU",
    type: "ultimate",
    status: "active",
    patch: "7.11",
    phases: [
      { id: "p1", name: "Fatebreaker", order: 0, videos: [], strategies: [], tips: [] },
    ],
    macros: [],
    recruitmentTemplates: [],
    references: { urls: [] },
    ...overrides,
  } as Content;
}

describe("disassembleContents", () => {
  it("flattens a minimal content into the contents+phases tabs", () => {
    const sheet = disassembleContents([makeContent()]);
    expect(sheet.contents).toHaveLength(1);
    expect(sheet.contents[0]).toMatchObject({
      id: "fru",
      displayName: "絶もうひとつの未来",
      type: "ultimate",
      patch: "7.11",
    });
    expect(sheet.phases).toHaveLength(1);
    expect(sheet.phases[0]).toMatchObject({
      content_id: "fru",
      phase_id: "p1",
      name: "Fatebreaker",
      order: "0",
    });
  });

  it("emits videos / mitigations / strategies / tips per phase", () => {
    const c = makeContent({
      phases: [
        {
          id: "p1",
          name: "P1",
          order: 0,
          videos: [{ title: "Walk", url: "https://e.com/v", author: "A" }],
          mitigation: { name: "Mit", url: "https://e.com/m", copyable: true },
          strategies: [{ id: "ast", name: "アスト式", description: "desc", popular: true }],
          tips: ["tip A", "tip B"],
        },
      ],
    });
    const sheet = disassembleContents([c]);
    expect(sheet.videos).toHaveLength(1);
    expect(sheet.videos[0]).toMatchObject({ content_id: "fru", phase_id: "p1", title: "Walk", author: "A" });
    expect(sheet.mitigations[0].copyable).toBe("true");
    expect(sheet.strategies[0].name).toBe("アスト式");
    expect(sheet.tips).toHaveLength(2);
    expect(sheet.tips.map((t) => t.tip)).toEqual(["tip A", "tip B"]);
  });

  it("emits macros / templates / references at the content level", () => {
    const c = makeContent({
      macros: [{ source: "@alice", url: "https://e.com/m.txt", text: "/macroicon" }],
      recruitmentTemplates: [{ template: "Hi {name}", variables: ["name", "date"] }],
      references: { primary: "りりーどーる", urls: ["https://e.com/r1", "https://e.com/r2"] },
    });
    const sheet = disassembleContents([c]);
    expect(sheet.macros).toHaveLength(1);
    expect(sheet.macros[0].source).toBe("@alice");
    expect(sheet.templates[0].variables).toBe("name, date");
    expect(sheet.contents[0].references_primary).toBe("りりーどーる");
    expect(sheet.references).toHaveLength(2);
  });

  it("emits macro phases[] as a comma-joined column (empty when absent)", () => {
    const c = makeContent({
      phases: [
        { id: "p1", name: "P1", order: 0, videos: [], strategies: [], tips: [] },
        { id: "p2", name: "P2", order: 1, videos: [], strategies: [], tips: [] },
      ],
      macros: [
        { source: "with phases", url: "https://e.com/a", text: "", phases: ["p1", "p2"] },
        { source: "no phases", url: "https://e.com/b", text: "" },
      ],
    });
    const sheet = disassembleContents([c]);
    expect(sheet.macros[0].phases).toBe("p1, p2");
    expect(sheet.macros[1].phases).toBe("");
  });

  it("emits templates.source and videos.phase columns (round-trip-critical fields)", () => {
    const c = makeContent({
      phases: [
        {
          id: "p1", name: "P1", order: 0,
          videos: [{ title: "V", url: "https://e.com/v", phase: "p1-2" }],
          strategies: [], tips: [],
        },
      ],
      recruitmentTemplates: [{ source: "@bob/note", template: "t", variables: [] }],
    });
    const sheet = disassembleContents([c]);
    expect(sheet.videos[0].phase).toBe("p1-2");
    expect(sheet.templates[0].source).toBe("@bob/note");
    // headers must include the columns or the CSV export silently drops them again
    expect(TAB_HEADERS.videos).toContain("phase");
    expect(TAB_HEADERS.templates).toContain("source");
  });

  it("sorts contents by patch then id (stable across re-exports)", () => {
    const sheet = disassembleContents([
      makeContent({ id: "z", patch: "7.11" }),
      makeContent({ id: "a", patch: "4.31" }),
      makeContent({ id: "b", patch: "7.11" }),
      makeContent({ id: "c", patch: undefined }),  // patch missing → sorts last
    ]);
    expect(sheet.contents.map((c) => c.id)).toEqual(["a", "b", "z", "c"]);
  });

  it("round-trips: disassemble → reassemble produces equivalent content", () => {
    const original = makeContent({
      phases: [
        {
          id: "p1",
          name: "P1",
          order: 0,
          videos: [{ title: "V1", url: "https://e.com/v1", author: "A", phase: "p1-2" }],
          mitigation: { name: "M1", url: "https://e.com/m1", copyable: true },
          strategies: [{ id: "s1", name: "S1", popular: true, description: "d1" }],
          tips: ["tip 1"],
        },
      ],
      macros: [{ source: "@a", url: "https://e.com/m.txt", text: "hi", phases: ["p1"] }],
      recruitmentTemplates: [{ source: "@bob/note", template: "Hi {date}", variables: ["date"] }],
      references: { primary: "p", urls: ["https://e.com/r"] },
    });
    const sheet = disassembleContents([original]);
    const back = assembleContents(sheet);
    expect(back.errors).toEqual([]);
    expect(back.contents).toHaveLength(1);
    const recovered = back.contents[0];
    expect(recovered.id).toBe(original.id);
    expect(recovered.phases[0].videos[0].url).toBe("https://e.com/v1");
    expect(recovered.phases[0].mitigation?.copyable).toBe(true);
    expect(recovered.phases[0].tips).toEqual(["tip 1"]);
    expect(recovered.macros[0].source).toBe("@a");
    expect(recovered.macros[0].phases).toEqual(["p1"]); // phases survive Content → Sheet → Content
    expect(recovered.references.urls).toEqual(["https://e.com/r"]);
  });

  it("round-trips lifecycle status: testing & inactive survive, active emits a blank column", () => {
    // headers must carry the column or a Sheet pull silently drops the flag
    expect(TAB_HEADERS.contents).toContain("status");

    // testing → emitted verbatim → reassembles to testing
    const testingSheet = disassembleContents([
      makeContent({ id: "m1s", type: "savage", status: "testing" }),
    ]);
    expect(testingSheet.contents[0].status).toBe("testing");
    const testingBack = assembleContents(testingSheet);
    expect(testingBack.errors).toEqual([]);
    expect(testingBack.contents[0].status).toBe("testing");

    // inactive → emitted verbatim → reassembles to inactive (regression guard: must NOT collapse to blank)
    const inactiveSheet = disassembleContents([makeContent({ id: "ucob", status: "inactive" })]);
    expect(inactiveSheet.contents[0].status).toBe("inactive");
    const inactiveBack = assembleContents(inactiveSheet);
    expect(inactiveBack.errors).toEqual([]);
    expect(inactiveBack.contents[0].status).toBe("inactive");
    expect(isContentPublished(inactiveBack.contents[0])).toBe(false);

    // active → blank column (clean diffs) → reassembles as active (status omitted)
    const activeSheet = disassembleContents([makeContent({ status: "active" })]);
    expect(activeSheet.contents[0].status).toBe("");
    const activeBack = assembleContents(activeSheet).contents[0];
    expect(activeBack.status).toBeUndefined();
    expect(isContentPublished(activeBack)).toBe(true);
  });
});

describe("rowsToCsv", () => {
  it("emits header + rows in declared order", () => {
    const csv = rowsToCsv(
      [{ id: "fru", name: "FRU" }, { id: "top", name: "TOP" }],
      ["id", "name"]
    );
    expect(csv).toBe("id,name\nfru,FRU\ntop,TOP\n");
  });

  it("escapes cells containing commas, quotes, or newlines", () => {
    const csv = rowsToCsv(
      [{ id: "x", note: 'has,comma and "quote" \nand newline' }],
      ["id", "note"]
    );
    expect(csv).toContain('"has,comma and ""quote"" \nand newline"');
  });

  it("emits empty cells as nothing (not quoted)", () => {
    const csv = rowsToCsv([{ id: "a", note: "" }], ["id", "note"]);
    expect(csv).toBe("id,note\na,\n");
  });

  it("returns header-only line when rows are empty + headers given", () => {
    expect(rowsToCsv([], ["id", "name"])).toBe("id,name\n");
  });
});
