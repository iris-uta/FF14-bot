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
});

export const PhaseSchema = z.object({
  id: z.string().describe("Phase ID（例: p1, p2-intermission）"),
  name: z.string().describe("表示名（例: P1 Fatebreaker）"),
  order: z.number().int().nonnegative(),
  description: z.string().optional(),
  videos: z.array(VideoLinkSchema).default([]),
  mitigation: MitigationTemplateSchema.optional(),
  strategies: z.array(StrategyVariantSchema).default([]).describe("複数の処理方が存在するphase"),
  tips: z.array(z.string()).default([]).describe("攻略Tips（短文）"),
});

export const ContentSchema = z.object({
  id: z.string().describe("一意のコンテンツID（例: fru, top, dsr）"),
  displayName: z.string().describe("日本語表示名（例: 絶エデン）"),
  shortName: z.string().describe("略称（例: FRU, TOP）"),
  type: ContentTypeSchema,
  patch: z.string().optional().describe("実装パッチ（例: 7.1）"),
  phases: z.array(PhaseSchema).min(1),
  macros: z.array(MacroRefSchema).default([]),
  recruitmentTemplates: z.array(RecruitmentTemplateSchema).default([]),
  references: z.object({
    primary: z.string().optional().describe("第一参照先（例: りりーどーる）"),
    urls: z.array(z.string().url()).default([]),
  }).default({ urls: [] }),
});
export type Content = z.infer<typeof ContentSchema>;
export type Phase = z.infer<typeof PhaseSchema>;
export type StrategyVariant = z.infer<typeof StrategyVariantSchema>;
