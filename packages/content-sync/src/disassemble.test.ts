import { describe, it, expect } from "vitest";
import type { Content } from "@ff14kotei/schema";
import { disassembleContents, rowsToCsv } from "./disassemble";
import { assembleContents } from "./assemble";

function makeContent(overrides: Partial<Content> = {}): Content {
  return {
    id: "fru",
    displayName: "絶もうひとつの未来",
    shortName: "FRU",
    type: "ultimate",
    patch: "7.11",
    phases: [
      { id: "p1", name: "Fatebreaker", order: 0, videos: [], strategies: [], tips: [] }
    ],
    macros: [],
    recruitmentTemplates: [],
    ...overrides
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
      patch: "7.11"
    });
    expect(sheet.phases).toHaveLength(1);
    expect(sheet.phases[0]).toMatchObject({
      content_id: "fru",
      phase_id: "p1",
      name: "Fatebreaker",
      order: "0"
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
          tips: ["tip A", "tip B"]
        }
      ]
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
      recruitmentTemplates: [{ template: "Hi {name}", variables: ["name", "date"] }]
    });
    const sheet = disassembleContents([c]);
    expect(sheet.macros).toHaveLength(1);
    expect(sheet.macros[0].source).toBe("@alice");
    expect(sheet.templates[0].variables).toBe("name, date");
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
          videos: [{ title: "V1", url: "https://e.com/v1", author: "A" }],
          mitigation: { name: "M1", url: "https://e.com/m1", copyable: true },
          strategies: [{ id: "s1", name: "S1", popular: false }],
          tips: ["tip 1"]
        }
      ],
      macros: [{ source: "@a", url: "https://e.com/m.txt", text: "hi" }]
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
