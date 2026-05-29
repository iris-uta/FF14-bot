import { describe, it, expect } from "vitest";
import {
  buildChannelTemplate,
  sanitizeUtilityName,
  SETUP_MODE_DESCRIPTIONS,
  type SetupMode
} from "./static-channel-template";
import type { Content } from "@ff14kotei/schema";

const sampleContent: Content = {
  id: "fru",
  displayName: "絶エデン",
  shortName: "FRU",
  type: "ultimate",
  phases: [
    { id: "p1", name: "P1", order: 1, videos: [], strategies: [], tips: [] },
    { id: "p2", name: "P2", order: 2, videos: [], strategies: [], tips: [] }
  ],
  macros: [],
  recruitmentTemplates: []
};

describe("buildChannelTemplate", () => {
  it("default mode is 'standard' with 7 utility channels", () => {
    const t = buildChannelTemplate(sampleContent);
    expect(t.utility).toHaveLength(7);
    expect(t.utility.map((c) => c.name)).toEqual([
      "全体",       // NEW: content-level overview (main strategy / playlist / party-wide macro)
      "ロビー",
      "雑談",
      "日程調整",
      "軽減表",
      "動画-参考",
      "進行度-記録"
    ]);
  });

  it("race mode adds 2 extra channels (攻略情報-発見, ログ-fflogs)", () => {
    const t = buildChannelTemplate(sampleContent, { mode: "race" });
    expect(t.utility).toHaveLength(9);
    expect(t.utility.map((c) => c.name)).toContain("全体");
    expect(t.utility.map((c) => c.name)).toContain("攻略情報-発見");
    expect(t.utility.map((c) => c.name)).toContain("ログ-fflogs");
  });

  it("standard mode includes overview channel with role=overview", () => {
    const t = buildChannelTemplate(sampleContent);
    const overview = t.utility.find((c) => c.role === "overview");
    expect(overview).toBeDefined();
    expect(overview?.name).toBe("全体");
  });

  it("minimal mode has only 2 utility (ロビー + 日程調整)", () => {
    const t = buildChannelTemplate(sampleContent, { mode: "minimal" });
    expect(t.utility).toHaveLength(2);
    expect(t.utility.map((c) => c.name)).toEqual(["ロビー", "日程調整"]);
  });

  it("phase channels are derived from content (1 per phase)", () => {
    const t = buildChannelTemplate(sampleContent);
    expect(t.phases).toHaveLength(2);
    expect(t.phases.map((p) => p.phaseId)).toEqual(["p1", "p2"]);
  });

  it("all modes have a lobby channel with role=lobby", () => {
    const modes: SetupMode[] = ["standard", "race", "minimal"];
    for (const mode of modes) {
      const t = buildChannelTemplate(sampleContent, { mode });
      const lobby = t.utility.find((c) => c.role === "lobby");
      expect(lobby).toBeDefined();
      expect(lobby?.name).toBe("ロビー");
    }
  });

  it("SETUP_MODE_DESCRIPTIONS covers all modes", () => {
    expect(SETUP_MODE_DESCRIPTIONS).toMatchObject({
      standard: expect.any(String),
      race: expect.any(String),
      minimal: expect.any(String)
    });
  });
});

describe("sanitizeUtilityName", () => {
  it("lowercases ASCII", () => {
    expect(sanitizeUtilityName("Hello World")).toBe("hello-world");
  });

  it("preserves Japanese characters", () => {
    expect(sanitizeUtilityName("日程調整")).toBe("日程調整");
  });

  it("clips to 100 chars", () => {
    expect(sanitizeUtilityName("あ".repeat(120)).length).toBeLessThanOrEqual(100);
  });

  it("falls back to 'untitled' on empty", () => {
    expect(sanitizeUtilityName("")).toBe("untitled");
    expect(sanitizeUtilityName("   ")).toBe("untitled");
  });
});
