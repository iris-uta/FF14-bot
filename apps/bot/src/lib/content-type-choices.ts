import type { SlashCommandStringOption } from "discord.js";

/**
 * Shared Choices for the `type` option on commands that take a `content`.
 * Mirrors the `ContentTypeSchema` enum in `packages/schema`.
 */
export const CONTENT_TYPE_CHOICES = [
  { name: "絶 (Ultimate)", value: "ultimate" },
  { name: "零式 (Savage)", value: "savage" },
  { name: "極 (Extreme)", value: "extreme" },
  { name: "幻想 (Unreal)", value: "unreal" },
  { name: "異聞 (Variant)", value: "variant" },
  { name: "詩想 (Criterion)", value: "criterion" },
  { name: "アライアンス", value: "alliance" },
  { name: "その他", value: "other" },
] as const;

/**
 * Apply the shared `type` option configuration to a SlashCommandStringOption.
 *
 * Usage:
 *   .addStringOption((opt) => configureContentTypeOption(opt))             // required
 *   .addStringOption((opt) => configureContentTypeOption(opt, { required: false }))
 */
export function configureContentTypeOption(
  opt: SlashCommandStringOption,
  options: { required?: boolean } = {}
): SlashCommandStringOption {
  return opt
    .setName("type")
    .setNameLocalizations({ ja: "種別" })
    .setDescription("コンテンツ種別 (これを選んでから content を選ぶと一覧が絞られる)")
    .setDescriptionLocalizations({
      ja: "コンテンツ種別 (絶/零式 等) — 先に選ぶとコンテンツ一覧が絞られる",
    })
    .setRequired(options.required ?? true)
    .setChoices(...CONTENT_TYPE_CHOICES);
}

/**
 * Build the consistent "type と content が一致しません" error reply.
 * Returns null if no mismatch.
 */
export function checkTypeMatch(
  contentType: string,
  typeFilter: string | null | undefined,
  contentId: string
): string | null {
  if (!typeFilter) return null;
  if (contentType === typeFilter) return null;
  return `type と content が一致しません。\n選択した type: \`${typeFilter}\` / content (${contentId}) の type: \`${contentType}\``;
}
