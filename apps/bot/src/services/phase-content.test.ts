import { describe, it, expect } from "vitest";
import { getMacrosForPhase, findPhase, splitMacroForDiscord } from "./phase-content";
import type { Content } from "@ff14kotei/schema";

const sample: Content = {
  id: "fru",
  displayName: "絶エデン",
  shortName: "FRU",
  type: "ultimate",
  phases: [
    { id: "p1", name: "P1", order: 1, videos: [], strategies: [], tips: [] },
    { id: "p3", name: "P3", order: 3, videos: [], strategies: [], tips: [] },
  ],
  macros: [
    { source: "りりーどーる (P1 - リリド式)", url: "https://example.com", text: "/p P1..." },
    { source: "りりーどーる (P3 - 安置基準)", url: "https://example.com", text: "/p P3 anchi" },
    { source: "りりーどーる (P3 - アポカリ基準)", url: "https://example.com", text: "/p P3 apoka" },
    { source: "ふうcだよ 全Phase", url: "https://example.com" },  // no phases[] & no P# token → regex fallback excludes it
  ],
  recruitmentTemplates: [],
  references: { urls: [] },
};

describe("getMacrosForPhase — source-regex fallback (no structured phases[])", () => {
  it("returns macros whose source contains the phase label", () => {
    const p1 = getMacrosForPhase(sample, "p1");
    expect(p1).toHaveLength(1);
    expect(p1[0].source).toContain("P1");
  });

  it("returns multiple macros for variant-rich phases", () => {
    const p3 = getMacrosForPhase(sample, "p3");
    expect(p3).toHaveLength(2);
  });

  it("does not match P1 source when looking up P10/P11/etc (word boundary)", () => {
    const wide: Content = {
      ...sample,
      macros: [
        { source: "macro (P1)", url: "https://example.com", text: "" },
        { source: "macro (P10)", url: "https://example.com", text: "" },
        { source: "macro (P11)", url: "https://example.com", text: "" },
      ],
    };
    const p1 = getMacrosForPhase(wide, "p1");
    expect(p1.map((m) => m.source)).toEqual(["macro (P1)"]);
  });

  it("returns [] for phase ID without numeric component", () => {
    expect(getMacrosForPhase(sample, "intermission")).toEqual([]);
  });
});

describe("getMacrosForPhase — structured phases[] (preferred over source regex)", () => {
  // Savage data: source strings carry "前半/後半"/"Ver.X" naming with NO P<n>
  // token, so the regex fallback alone matches nothing. The phases[] field is
  // what makes these resolvable.
  const savage: Content = {
    id: "m6s",
    displayName: "クルーザー級零式2層",
    shortName: "M6S",
    type: "savage",
    phases: [
      { id: "p1-front", name: "前半", order: 1, videos: [], strategies: [], tips: [] },
      { id: "p2-back", name: "後半", order: 2, videos: [], strategies: [], tips: [] },
    ],
    macros: [
      { source: "Game8 新FFO式 (前半 + 雑魚)", url: "https://example.com", phases: ["p1-front"], text: "/p 前半" },
      { source: "Game8 新FFO式 (後半: 山川〜)", url: "https://example.com", phases: ["p2-back"], text: "/p 後半" },
    ],
    recruitmentTemplates: [],
    references: { urls: [] },
  };

  it("matches by phase id even when the source has no P<n> token", () => {
    const front = getMacrosForPhase(savage, "p1-front");
    expect(front.map((m) => m.source)).toEqual(["Game8 新FFO式 (前半 + 雑魚)"]);
    const back = getMacrosForPhase(savage, "p2-back");
    expect(back.map((m) => m.source)).toEqual(["Game8 新FFO式 (後半: 山川〜)"]);
  });

  it("returns [] for a phase no macro lists (no spurious regex match)", () => {
    // Regex fallback for "p2-back" would derive P2 and could match a stray
    // source — structured phases[] prevents that leakage.
    expect(getMacrosForPhase(savage, "p9")).toEqual([]);
  });

  it("a 全phase-共通 macro (phases lists every id) appears in every phase", () => {
    const ucobLike: Content = {
      id: "ucob",
      displayName: "絶バハムート",
      shortName: "UCOB",
      type: "ultimate",
      phases: ["p1", "p2", "p3"].map((id, i) => ({
        id, name: id.toUpperCase(), order: i + 1, videos: [], strategies: [], tips: [],
      })),
      // source says 「全Phase」 — \bP3\b etc. would match nothing without phases[]
      macros: [
        { source: "絶バハマクロ 全Phase", url: "https://example.com", phases: ["p1", "p2", "p3"], text: "/p all" },
      ],
      recruitmentTemplates: [],
      references: { urls: [] },
    };
    expect(getMacrosForPhase(ucobLike, "p1")).toHaveLength(1);
    expect(getMacrosForPhase(ucobLike, "p2")).toHaveLength(1);
    expect(getMacrosForPhase(ucobLike, "p3")).toHaveLength(1);
  });

  it("a multi-phase macro (P1-P3 共通) resolves to its middle phase too", () => {
    // uwu edge case: source "(P1-P3 共通 ...)" — \bP2\b never matched P1-P3.
    const uwuLike: Content = {
      id: "uwu",
      displayName: "絶アルテマ",
      shortName: "UWU",
      type: "ultimate",
      phases: ["p1", "p2", "p3"].map((id, i) => ({
        id, name: id.toUpperCase(), order: i + 1, videos: [], strategies: [], tips: [],
      })),
      macros: [
        { source: "りりーどーる (P1-P3 共通 - ...)", url: "https://example.com", phases: ["p1", "p2", "p3"], text: "/p" },
      ],
      recruitmentTemplates: [],
      references: { urls: [] },
    };
    expect(getMacrosForPhase(uwuLike, "p2")).toHaveLength(1);
  });

  it("prefers phases[] over the source token when both could apply", () => {
    // Source contains "P3" but phases[] pins it to p1 only → p1 wins, p3 empty.
    const pinned: Content = {
      ...sample,
      macros: [
        { source: "macro mentions P3 in text", url: "https://example.com", phases: ["p1"], text: "" },
      ],
    };
    expect(getMacrosForPhase(pinned, "p1")).toHaveLength(1);
    expect(getMacrosForPhase(pinned, "p3")).toHaveLength(0);
  });

  it("mixes structured and unstructured macros in one content", () => {
    const mixed: Content = {
      ...sample,
      macros: [
        { source: "structured only", url: "https://example.com", phases: ["p1"], text: "" },
        { source: "regex (P1 - legacy)", url: "https://example.com", text: "" }, // no phases[] → regex
        { source: "regex (P3 - legacy)", url: "https://example.com", text: "" },
      ],
    };
    expect(getMacrosForPhase(mixed, "p1").map((m) => m.source)).toEqual([
      "structured only",
      "regex (P1 - legacy)",
    ]);
    expect(getMacrosForPhase(mixed, "p3").map((m) => m.source)).toEqual(["regex (P3 - legacy)"]);
  });
});

describe("findPhase", () => {
  it("returns content+phase for known id", () => {
    const found = findPhase(sample, "p3");
    expect(found?.phase.id).toBe("p3");
  });

  it("returns null for unknown id", () => {
    expect(findPhase(sample, "p99")).toBeNull();
  });
});

describe("splitMacroForDiscord", () => {
  it("returns single chunk when text is short", () => {
    expect(splitMacroForDiscord("short")).toEqual(["short"]);
  });

  it("splits at line boundaries when text exceeds limit", () => {
    const long = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const chunks = splitMacroForDiscord(long, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
    expect(chunks.join("\n")).toBe(long);
  });

  it("never splits in the middle of a line", () => {
    const lines = ["a".repeat(50), "b".repeat(50), "c".repeat(50)];
    const chunks = splitMacroForDiscord(lines.join("\n"), 60);
    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });
});
