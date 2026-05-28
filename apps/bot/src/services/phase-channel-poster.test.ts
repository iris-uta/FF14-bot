import { describe, it, expect, vi } from "vitest";
import type { Content, Phase } from "@ff14kotei/schema";
import { buildPhaseEmbed, postUtilityIntro } from "./phase-channel-poster";
import type { TextChannel } from "discord.js";

function makeContent(overrides: Partial<Content> = {}): Content {
  return {
    id: "test",
    displayName: "テストコンテンツ",
    shortName: "TEST",
    type: "ultimate",
    phases: [
      {
        id: "p1",
        name: "P1 (テストフェーズ)",
        order: 1,
        videos: [],
        strategies: [],
        tips: [],
      },
    ],
    macros: [],
    recruitmentTemplates: [],
    references: { urls: [] },
    ...overrides,
  } as Content;
}

function makeChannel(sendImpl = vi.fn().mockResolvedValue({ id: "msg" })) {
  return { send: sendImpl } as unknown as TextChannel;
}

// ── buildPhaseEmbed ─────────────────────────────────────────────────────────

describe("buildPhaseEmbed — variant: intro (default)", () => {
  it("shows popularStrategy as a 'description' line if set", () => {
    const content = makeContent({
      phases: [{ id: "p1", name: "P1", order: 1, popularStrategy: "ヤークト無視 + サイコロ 1211", videos: [], strategies: [], tips: [] }],
    });
    const data = buildPhaseEmbed(content, content.phases[0]).toJSON();
    expect(data.description).toContain("野良主流");
    expect(data.description).toContain("ヤークト無視 + サイコロ 1211");
  });

  it("omits description even if phase.description is set (intro = compact)", () => {
    const content = makeContent({
      phases: [{ id: "p1", name: "P1", order: 1, description: "very long phase description", videos: [], strategies: [], tips: [] }],
    });
    const data = buildPhaseEmbed(content, content.phases[0]).toJSON();
    // popularStrategy not set, description not in intro → no description block
    expect(data.description).toBeUndefined();
  });

  it("omits Tips, mitigation, macro list (intro = compact)", () => {
    const content = makeContent({
      phases: [{
        id: "p1", name: "P1", order: 1,
        videos: [],
        mitigation: { name: "m", url: "https://e.com/m", copyable: false },
        strategies: [],
        tips: ["tip 1", "tip 2"],
      }],
    });
    const fieldNames = buildPhaseEmbed(content, content.phases[0]).toJSON().fields?.map((f) => f.name) ?? [];
    expect(fieldNames).not.toContain("Tips");
    expect(fieldNames).not.toContain("軽減表");
    expect(fieldNames.some((n) => n.startsWith("マクロ"))).toBe(false);
  });

  it("includes 処理法 + 攻略動画 (the two intro-essential fields)", () => {
    const content = makeContent({
      phases: [{
        id: "p1", name: "P1", order: 1,
        videos: [{ title: "P1 解説", url: "https://e.com/v", author: "@author" }],
        strategies: [{ id: "ast", name: "アスト式", popular: true }],
        tips: [],
      }],
    });
    const fieldNames = buildPhaseEmbed(content, content.phases[0]).toJSON().fields?.map((f) => f.name) ?? [];
    expect(fieldNames).toContain("処理法");
    expect(fieldNames).toContain("攻略動画");
  });

  it("動画 lines are numbered '1)' / '2)' with markdown link + author", () => {
    const content = makeContent({
      phases: [{
        id: "p1", name: "P1", order: 1,
        videos: [
          { title: "解説 A", url: "https://e.com/a", author: "X" },
          { title: "解説 B", url: "https://e.com/b" },
        ],
        strategies: [], tips: [],
      }],
    });
    const value = buildPhaseEmbed(content, content.phases[0]).toJSON().fields?.find((f) => f.name === "攻略動画")?.value ?? "";
    expect(value).toContain("1) [解説 A](https://e.com/a) — X");
    expect(value).toContain("2) [解説 B](https://e.com/b)");
  });
});

describe("buildPhaseEmbed — variant: full", () => {
  it("includes everything: description + Tips + mitigation + macro list", () => {
    const content = makeContent({
      phases: [{
        id: "p1", name: "P1", order: 1,
        description: "phase 説明",
        videos: [],
        mitigation: { name: "M", url: "https://e.com/m", copyable: true },
        strategies: [],
        tips: ["a", "b"],
      }],
      macros: [{ source: "@author P1 macro", url: "https://e.com/macro", text: undefined }],
    });
    const data = buildPhaseEmbed(content, content.phases[0], { variant: "full" }).toJSON();
    const fieldNames = data.fields?.map((f) => f.name) ?? [];
    expect(data.description).toContain("phase 説明");
    expect(fieldNames).toContain("Tips");
    expect(fieldNames).toContain("軽減表");
    expect(fieldNames.some((n) => n.startsWith("マクロ"))).toBe(true);
  });
});

describe("buildPhaseEmbed — back-compat", () => {
  it("accepts a number as 3rd arg (legacy color shortcut)", () => {
    const content = makeContent();
    const e = buildPhaseEmbed(content, content.phases[0], 0xff0000).toJSON();
    expect(e.color).toBe(0xff0000);
  });
});

// ── postUtilityIntro: overview channel ──────────────────────────────────────

describe("postUtilityIntro role=overview", () => {
  it("posts a placeholder when content.overview is not set", async () => {
    const ch = makeChannel();
    await postUtilityIntro(ch, makeContent(), "overview");
    const calls = (ch.send as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].content).toContain("未登録");
  });

  it("emits all 4 overview sections when fully populated", async () => {
    const ch = makeChannel();
    const content = makeContent({
      phases: [{
        id: "p1", name: "P1", order: 1,
        popularStrategy: "野良主流 A",
        videos: [], strategies: [], tips: [],
      }],
      overview: {
        mainStrategy: "全体: 優先HTD",
        videoPlaylist: { title: "FRU 全 phase 解説", url: "https://e.com/list", author: "Alice" },
        partyWideMacro: { source: "@alice", url: "https://e.com/macro", text: "/p hi" },
      },
    });
    await postUtilityIntro(ch, content, "overview");
    const calls = (ch.send as ReturnType<typeof vi.fn>).mock.calls;
    // First message: the overview embed text
    const main = calls[0][0].content;
    expect(main).toContain("主流処理法");
    expect(main).toContain("全体: 優先HTD");
    expect(main).toContain("攻略動画プレイリスト");
    expect(main).toContain("[FRU 全 phase 解説](https://e.com/list) — Alice");
    expect(main).toContain("野良主流");
    expect(main).toContain("**P1**: 野良主流 A");
    expect(main).toContain("編成全体マクロ");
    // Second message: the macro body
    expect(calls.length).toBeGreaterThan(1);
    expect(calls[1][0].content).toContain("/p hi");
  });

  it("omits the macro followup when partyWideMacro.text is empty", async () => {
    const ch = makeChannel();
    const content = makeContent({
      overview: {
        partyWideMacro: { source: "@a", url: "https://e.com/m" }, // no text
      },
    });
    await postUtilityIntro(ch, content, "overview");
    const calls = (ch.send as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1); // just the embed text, no macro body
  });

  it("emits guideUrl + bisUrl sections when set", async () => {
    const ch = makeChannel();
    const content = makeContent({
      overview: {
        guideUrl: "https://na.finalfantasyxiv.com/lodestone/character/123/blog/4567",
        bisUrl: "https://etro.gg/gearset/abc",
      },
    });
    await postUtilityIntro(ch, content, "overview");
    const main = (ch.send as ReturnType<typeof vi.fn>).mock.calls[0][0].content;
    expect(main).toContain("📚 攻略ガイド");
    expect(main).toContain("https://na.finalfantasyxiv.com/lodestone");
    expect(main).toContain("⚔️ 最適装備");
    expect(main).toContain("https://etro.gg/gearset/abc");
  });

  it("emits macro list grouped by phase, with no-phaseId macros at the end", async () => {
    const ch = makeChannel();
    const content = makeContent({
      phases: [
        { id: "p1", name: "P1 開幕", order: 0, videos: [], strategies: [], tips: [] },
        { id: "p2", name: "P2 中盤", order: 1, videos: [], strategies: [], tips: [] },
      ],
      macros: [
        { phaseId: "p2", source: "@bob P2", url: "https://e.com/p2", text: undefined },
        { phaseId: "p1", source: "@alice P1", url: "https://e.com/p1", text: undefined },
        // No phaseId — should appear last under「全体」
        { source: "@carol 全体", url: "https://e.com/all", text: undefined },
      ],
    });
    await postUtilityIntro(ch, content, "overview");
    const main = (ch.send as ReturnType<typeof vi.fn>).mock.calls[0][0].content;
    expect(main).toContain("📜 マクロ一覧");
    // Order: P1 first, P2 second, 全体 last
    const idxP1 = main.indexOf("**P1 開幕**");
    const idxP2 = main.indexOf("**P2 中盤**");
    const idxAll = main.indexOf("**全体**");
    expect(idxP1).toBeGreaterThan(0);
    expect(idxP2).toBeGreaterThan(idxP1);
    expect(idxAll).toBeGreaterThan(idxP2);
    expect(main).toContain("[@alice P1](https://e.com/p1)");
    expect(main).toContain("[@bob P2](https://e.com/p2)");
    expect(main).toContain("[@carol 全体](https://e.com/all)");
  });
});

describe("postUtilityIntro role=mitigation", () => {
  it("lists all phase mitigations grouped by phase name", async () => {
    const ch = makeChannel();
    const content = makeContent({
      phases: [
        { id: "p1", name: "P1", order: 1, videos: [], strategies: [], tips: [],
          mitigation: { name: "P1 軽減", url: "https://e.com/m1", copyable: false } },
        { id: "p2", name: "P2", order: 2, videos: [], strategies: [], tips: [],
          mitigation: { name: "P2 軽減", url: "https://e.com/m2", copyable: true } },
      ],
    });
    await postUtilityIntro(ch, content, "mitigation");
    const body = (ch.send as ReturnType<typeof vi.fn>).mock.calls[0][0].content;
    expect(body).toContain("P1");
    expect(body).toContain("[P1 軽減](https://e.com/m1)");
    expect(body).toContain("P2");
    expect(body).toContain("[P2 軽減](https://e.com/m2)");
    expect(body).toContain("コピーして固定用にカスタマイズ"); // copyable hint
  });

  it("shows placeholder text when no phase has mitigation set", async () => {
    const ch = makeChannel();
    await postUtilityIntro(ch, makeContent(), "mitigation");
    const body = (ch.send as ReturnType<typeof vi.fn>).mock.calls[0][0].content;
    expect(body).toContain("軽減表テンプレが未登録");
  });

  it("dedupes mitigations that share a URL across phases", async () => {
    const ch = makeChannel();
    const shared = { name: "全 phase 軽減 (1 sheet)", url: "https://e.com/shared", copyable: false };
    const content = makeContent({
      phases: [
        { id: "p1", name: "P1", order: 1, videos: [], strategies: [], tips: [], mitigation: shared },
        { id: "p2", name: "P2", order: 2, videos: [], strategies: [], tips: [], mitigation: shared },
      ],
    });
    await postUtilityIntro(ch, content, "mitigation");
    const body = (ch.send as ReturnType<typeof vi.fn>).mock.calls[0][0].content;
    const matches = body.match(/全 phase 軽減 \(1 sheet\)/g) ?? [];
    expect(matches).toHaveLength(1); // only emitted once
  });
});
