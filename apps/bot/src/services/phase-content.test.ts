import { describe, it, expect } from "vitest";
import { getMacrosForPhase, findPhase, splitMacroForDiscord } from "./phase-content";
import type { Content } from "@ff14kotei/schema";

const sample: Content = {
  id: "fru",
  displayName: "絶エデン",
  shortName: "FRU",
  type: "ultimate",
  phases: [
    { id: "p1", name: "P1", order: 1, videos: [], strategies: [] },
    { id: "p3", name: "P3", order: 3, videos: [], strategies: [] }
  ],
  macros: [
    { source: "りりーどーる (P1 - リリド式)", url: "https://example.com", text: "/p P1..." },
    { source: "りりーどーる (P3 - 安置基準)", url: "https://example.com", text: "/p P3 anchi" },
    { source: "りりーどーる (P3 - アポカリ基準)", url: "https://example.com", text: "/p P3 apoka" },
    { source: "ふうcだよ 全Phase", url: "https://example.com" },  // no P# label → excluded
  ],
  recruitmentTemplates: [],
  references: { urls: [] }
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
