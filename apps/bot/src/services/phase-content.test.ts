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
    { id: "p3", name: "P3", order: 3, videos: [], strategies: [], tips: [] }
  ],
  macros: [
    { source: "りりーどーる (P1 - リリド式)", url: "https://example.com", text: "/p P1..." },
    { source: "りりーどーる (P3 - 安置基準)", url: "https://example.com", text: "/p P3 anchi" },
    { source: "りりーどーる (P3 - アポカリ基準)", url: "https://example.com", text: "/p P3 apoka" },
    { source: "ふうcだよ 全Phase", url: "https://example.com" },  // no P# label → excluded
  ],
  recruitmentTemplates: []
};

describe("getMacrosForPhase", () => {
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
        { source: "macro (P11)", url: "https://example.com", text: "" }
      ]
    };
    const p1 = getMacrosForPhase(wide, "p1");
    expect(p1.map((m) => m.source)).toEqual(["macro (P1)"]);
  });

  it("returns [] for phase ID without numeric component", () => {
    expect(getMacrosForPhase(sample, "intermission")).toEqual([]);
  });

  it("prefers explicit phaseId field over source regex (new schema)", () => {
    const withPhaseId: Content = {
      ...sample,
      macros: [
        // Explicit phaseId — winning match
        { phaseId: "p1", source: "ノーラベル", url: "https://example.com" },
        // Old-style regex match in source — should be ignored when explicit exists
        { source: "りりーどーる (P1 - 旧)", url: "https://example.com" }
      ]
    };
    const p1 = getMacrosForPhase(withPhaseId, "p1");
    expect(p1).toHaveLength(1);
    expect(p1[0].source).toBe("ノーラベル");
  });

  it("falls back to regex match when no macro has explicit phaseId for this phase", () => {
    const mixed: Content = {
      ...sample,
      macros: [
        // For p2 — irrelevant
        { phaseId: "p2", source: "p2 only", url: "https://example.com" },
        // No phaseId — fallback regex catches this for p1
        { source: "P1 macro", url: "https://example.com" }
      ]
    };
    const p1 = getMacrosForPhase(mixed, "p1");
    expect(p1).toHaveLength(1);
    expect(p1[0].source).toBe("P1 macro");
  });

  it("ignores macros with a wrong phaseId even if source happens to match phase number", () => {
    // phaseId is the source of truth — a phaseId=p2 macro should NEVER appear
    // under p1 just because its source string mentions "P1" somewhere.
    const trap: Content = {
      ...sample,
      macros: [
        { phaseId: "p2", source: "P1 mentioned but it's P2 macro", url: "https://example.com" }
      ]
    };
    expect(getMacrosForPhase(trap, "p1")).toEqual([]);
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
