import { z } from "zod";

export const ContentTypeSchema = z.enum([
  "ultimate",  // 絶
  "savage",    // 零式
  "extreme",   // 極
  "unreal",    // 幻想
  "variant",   // 異聞
  "criterion", // 詩想
  "alliance",  // アライアンス
  "other",
]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const MacroRefSchema = z.object({
  source: z.string().describe("参照元（例: りりーどーる, ゲーム8, 新みんとっと, Lily Doll）"),
  url: z.string().url(),
  phases: z.array(z.string()).optional().describe(
    "このマクロが対応する phase id の配列（例: [p1, p2]）。" +
    "全 phase 共通マクロは全 phase id を列挙する。" +
    "省略時は source 文字列中の P<n> トークン推定にフォールバック（後方互換）"
  ),
  text: z.string().optional().describe("マクロ本体（コピペ用）"),
});

export const VideoLinkSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  author: z.string().optional(),
  phase: z.string().optional().describe("どのphase向けか。全体の場合は省略"),
});

export const MitigationTemplateSchema = z.object({
  name: z.string().describe("元の軽減表の名前"),
  url: z.string().url().describe("Google Sheets等のリンク"),
  copyable: z.boolean().default(true).describe("コピーして固定毎にカスタマイズ可能か"),
});

export const RecruitmentTemplateSchema = z.object({
  source: z.string().describe("テンプレ提供者（例: ◯◯さんのnote）").optional(),
  template: z.string().describe("募集テンプレ本文（Markdown / 変数: {{date}}, {{progress}} 等）"),
  variables: z.array(z.string()).default([]).describe("テンプレに使える変数名"),
});

export const StrategyVariantSchema = z.object({
  id: z.string().describe("バリアントID（例: ast-shiki, juuji-shiki）"),
  name: z.string().describe("表示名（例: アスト式, 十字式）"),
  description: z.string().optional(),
  popular: z.boolean().default(false).describe(
    "野良主流フラグ — true なら /setup wizard で default 選択 + phase intro 冒頭にバッジ表示"
  ),
});

/** Content-level overview info used by the「全体」channel in /setup. */
export const ContentOverviewSchema = z.object({
  mainStrategy: z.string().optional().describe(
    "コンテンツ全体の主流処理法 1 行 (例: '優先HTD + STD4入替 / 塔キャス固定')"
  ),
  videoPlaylist: z.object({
    title: z.string(),
    url: z.string().url(),
    author: z.string().optional(),
  }).optional().describe("コンテンツ全体プレイリスト URL (P1〜最終 phase をまとめた解説プレイリスト)"),
  partyWideMacro: MacroRefSchema.optional().describe(
    "編成全体共通マクロ (各 phase に個別マクロがある場合の「最初に貼るマクロ」)"
  ),
});

export const PhaseSchema = z.object({
  id: z.string().describe("Phase ID（例: p1, p2-intermission）"),
  name: z.string().describe("表示名（例: P1 Fatebreaker）"),
  order: z.number().int().nonnegative(),
  description: z.string().optional(),
  popularStrategy: z.string().optional().describe(
    "野良主流の処理法を 1 行で (channel intro 冒頭に目立つ形で表示される)。 例: 「ヤークト無視 + サイコロ 1211」"
  ),
  videos: z.array(VideoLinkSchema).default([]),
  mitigation: MitigationTemplateSchema.optional(),
  strategies: z.array(StrategyVariantSchema).default([]).describe("複数の処理法が存在するphase"),
  tips: z.array(z.string()).default([]).describe("攻略Tips（短文）"),
});

export const ContentSchema = z.object({
  id: z.string().describe("一意のコンテンツID（例: fru, top, dsr）"),
  displayName: z.string().describe("日本語表示名（例: 絶エデン）"),
  shortName: z.string().describe("略称（例: FRU, TOP）"),
  type: ContentTypeSchema,
  status: z
    .enum(["published", "testing", "active", "inactive"])
    .optional()
    // 'published' は active の旧称エイリアス → active に正規化（後方互換）。
    // 省略は undefined のまま保持し、可視判定 helper 側で active 扱いにする。
    .transform((s) => (s === "published" ? "active" : s))
    .describe(
      "公開状態（ライフサイクル）。active（または省略）=bot 表示 + /setup 可 + 公開サイト表示。" +
        "testing=backend（YAML/Sheets/`/dev-test`）でのみ検証し、ユーザー一覧・公開サイトに出さず /setup 不可（未テスト用）。" +
        "inactive=アーカイブ。ユーザー一覧・公開サイトから外し /setup 不可（過去コンテンツ）。" +
        "省略時は active 扱い（後方互換）。'published' は active の旧称エイリアスとして受理。"
    ),
  patch: z.string().optional().describe("実装パッチ（例: 7.1）"),
  phases: z.array(PhaseSchema).min(1),
  macros: z.array(MacroRefSchema).default([]),
  recruitmentTemplates: z.array(RecruitmentTemplateSchema).default([]),
  overview: ContentOverviewSchema.optional().describe(
    "「全体」channel に表示する content 全体の概要 (主流処理法 / プレイリスト / 全体マクロ)"
  ),
  references: z.object({
    primary: z.string().optional().describe("第一参照先（例: りりーどーる）"),
    urls: z.array(z.string().url()).default([]),
  }).default({ urls: [] }),
}).superRefine((content, ctx) => {
  // macros[].phases は実在する phase id を指していなければならない（backfill の typo を検出）
  const phaseIds = new Set(content.phases.map((p) => p.id));
  content.macros.forEach((m, mi) => {
    m.phases?.forEach((pid, pj) => {
      if (!phaseIds.has(pid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["macros", mi, "phases", pj],
          message: `unknown phase id "${pid}" — phases[].id に存在しません`,
        });
      }
    });
  });
});
export type Content = z.infer<typeof ContentSchema>;
export type Phase = z.infer<typeof PhaseSchema>;
export type StrategyVariant = z.infer<typeof StrategyVariantSchema>;
export type ContentOverview = z.infer<typeof ContentOverviewSchema>;

/**
 * コンテンツのライフサイクル状態（dashboard のドロップダウン表示順）。
 * 'published' は入力時のみ受理する active の旧称エイリアスなので、この一覧には含めない。
 */
export const CONTENT_STATUSES = ["testing", "active", "inactive"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** 運用中。bot 表示 + /setup 可 + 公開サイト表示。status 省略 = active 扱い。 */
export function isContentActive(content: Content): boolean {
  return content.status === undefined || content.status === "active";
}
/** 検証中（backend のみ。ユーザー一覧・公開サイト非表示・/setup 不可）。 */
export function isContentTesting(content: Content): boolean {
  return content.status === "testing";
}
/** アーカイブ済み（過去コンテンツ。ユーザー一覧・公開サイト非表示・/setup 不可）。 */
export function isContentInactive(content: Content): boolean {
  return content.status === "inactive";
}

/**
 * ユーザー（bot の一覧 / 公開 web サイト）に見せてよいコンテンツかの唯一の判定ロジック。
 * 可視 = active（または省略）のみ。testing と inactive は隠す。
 * bot の一覧 (`getAllContents`) と公開 web サイトの両方がこれを再利用することで、
 * 新しい一覧画面が増えても testing / inactive コンテンツが再リークしないようにする。
 * NOTE: 呼び出し側を無改修に保つため旧名のまま。意味は「可視（active のみ）」に更新済み。
 */
export function isContentPublished(content: Content): boolean {
  return isContentActive(content);
}
