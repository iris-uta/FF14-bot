import { describe, it, expect } from "vitest";
import { buildChannelPlan } from "./channel-setup";
import type { Content } from "@ff14kotei/schema";

const baseContent: Content = {
  id: "fru",
  displayName: "絶エデン",
  shortName: "FRU",
  type: "ultimate",
  phases: [
    {
      id: "p1",
      name: "P1 フェイトブレイカー (Fatebreaker)",
      order: 1,
      description: "開幕フェーズ。\n野良主流は優先HTD/STD4入替/塔キャス固定。",
      videos: [],
      strategies: []
    },
    {
      id: "p3",
      name: "P3 闇の巫女 (Oracle of Darkness)",
      order: 3,
      description: "アポカリプス処理が肝。",
      videos: [
        { title: "v1", url: "https://example.com/1" },
        { title: "v2", url: "https://example.com/2" }
      ],
      strategies: [
        { id: "anchi", name: "アポカリ：最初の安置基準", popular: false },
        { id: "apoka", name: "アポカリ：アポカリ基準", popular: false }
      ]
    }
  ],
  macros: [],
  recruitmentTemplates: [],
  references: { urls: [] }
};

describe("buildChannelPlan", () => {
  it("categoryName defaults to content display name + 固定", () => {
    expect(buildChannelPlan(baseContent).categoryName).toBe("絶エデン 固定");
  });

  it("categoryName uses partyName when provided", () => {
    expect(
      buildChannelPlan(baseContent, { partyName: "週末絶エデン" }).categoryName
    ).toBe("週末絶エデン 固定");
  });

  it("creates one channel per phase, with phaseId attached", () => {
    const plan = buildChannelPlan(baseContent);
    expect(plan.channels).toHaveLength(2);
    expect(plan.channels.map((c) => c.phaseId)).toEqual(["p1", "p3"]);
  });

  it("channel name combines phase id and boss name, stripped of P# prefix and (英語名)", () => {
    const plan = buildChannelPlan(baseContent);
    expect(plan.channels[0].name).toBe("p1-フェイトブレイカー");
    expect(plan.channels[1].name).toBe("p3-闇の巫女");
  });

  it("channel name has no spaces, no uppercase, no parens", () => {
    const plan = buildChannelPlan(baseContent);
    for (const ch of plan.channels) {
      expect(ch.name).not.toMatch(/\s/);
      expect(ch.name).not.toMatch(/[A-Z]/);
      expect(ch.name).not.toMatch(/[()（）]/);
      expect(ch.name.length).toBeLessThanOrEqual(100);
    }
  });

  it("topic includes phase description first line and strategy names", () => {
    const plan = buildChannelPlan(baseContent);
    expect(plan.channels[0].topic).toContain("開幕フェーズ");
    expect(plan.channels[1].topic).toContain("アポカリ：最初の安置基準");
    expect(plan.channels[1].topic).toContain("アポカリ：アポカリ基準");
    expect(plan.channels[1].topic).toContain("動画 2本");
  });

  it("category name is clipped to 100 chars", () => {
    const long = { ...baseContent, displayName: "あ".repeat(120) };
    const plan = buildChannelPlan(long);
    expect(plan.categoryName.length).toBeLessThanOrEqual(100);
  });
});
