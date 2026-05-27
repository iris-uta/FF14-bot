import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getAllContents, getContentById } from "../lib/contents";
import { sortByPatch } from "../lib/content-sort";
import { configureContentTypeOption } from "../lib/content-type-choices";
import { resolveContentOrError } from "../services/resolve-content";
import {
  findTemplate,
  renderTemplate,
  extractPlaceholders,
} from "../services/recruit-template";

export const data = new SlashCommandBuilder()
  .setName("recruit-template")
  .setNameLocalizations({ ja: "募集テンプレ" })
  .setDescription("コンテンツの募集テンプレを生成 (固定 channel なら content 自動検出)")
  .setDescriptionLocalizations({
    ja: "募集テンプレを生成 (固定 channel 内なら自動検出)",
  })
  .addStringOption((opt) => configureContentTypeOption(opt, { required: false }))
  .addStringOption((opt) =>
    opt
      .setName("content")
      .setNameLocalizations({ ja: "コンテンツ" })
      .setDescription("コンテンツID (省略時は固定 channel から自動検出)")
      .setDescriptionLocalizations({ ja: "コンテンツID (省略時は固定 channel から自動検出)" })
      .setAutocomplete(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("template")
      .setNameLocalizations({ ja: "テンプレ番号" })
      .setDescription("テンプレが複数ある時の index (default 0)")
      .setDescriptionLocalizations({ ja: "テンプレが複数ある時の番号 (default 0)" })
      .setMinValue(0)
  )
  .addStringOption((opt) =>
    opt
      .setName("date")
      .setNameLocalizations({ ja: "日程" })
      .setDescription("日程 (例: 2025-06-01 21:00)")
      .setDescriptionLocalizations({ ja: "日程 (例: 2025-06-01 21:00)" })
      .setMaxLength(100)
  )
  .addStringOption((opt) =>
    opt
      .setName("progress")
      .setNameLocalizations({ ja: "進行度" })
      .setDescription("進行度 (例: P3後半)")
      .setDescriptionLocalizations({ ja: "進行度 (例: P3後半)" })
      .setMaxLength(100)
  )
  .addStringOption((opt) =>
    opt
      .setName("recruitingroles")
      .setNameLocalizations({ ja: "募集ロール" })
      .setDescription("募集ロール (例: H1H2 D2D4)")
      .setDescriptionLocalizations({ ja: "募集ロール (例: H1H2 D2D4)" })
      .setMaxLength(100)
  )
  .addStringOption((opt) =>
    opt
      .setName("datacenter")
      .setNameLocalizations({ ja: "データセンター" })
      .setDescription("DC (例: Mana)")
      .setDescriptionLocalizations({ ja: "データセンター (例: Mana)" })
      .setMaxLength(60)
  )
  .addStringOption((opt) =>
    opt
      .setName("language")
      .setNameLocalizations({ ja: "言語" })
      .setDescription("言語 (例: 日本語)")
      .setDescriptionLocalizations({ ja: "言語 (例: 日本語)" })
      .setMaxLength(60)
  )
  .addStringOption((opt) =>
    opt
      .setName("goal")
      .setNameLocalizations({ ja: "目標" })
      .setDescription("固定の目標 (例: クリア)")
      .setDescriptionLocalizations({ ja: "固定の目標 (例: クリア)" })
      .setMaxLength(200)
  )
  .addStringOption((opt) =>
    opt
      .setName("chouseisan_url")
      .setNameLocalizations({ ja: "調整さんurl" })
      .setDescription("調整さん等のURL (任意)")
      .setDescriptionLocalizations({ ja: "調整さん等のURL (任意)" })
      .setMaxLength(500)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "content") {
    await interaction.respond([]);
    return;
  }
  const typeFilter = interaction.options.getString("type");
  const lower = focused.value.toLowerCase();
  const matched = getAllContents().filter((c) => {
    if (typeFilter && c.type !== typeFilter) return false;
    return (
      c.id.toLowerCase().includes(lower) ||
      c.displayName.toLowerCase().includes(lower) ||
      c.shortName.toLowerCase().includes(lower)
    );
  });
  await interaction.respond(
    sortByPatch(matched)
      .slice(0, 25)
      .map((c) => ({
        name: `${c.patch ? `[${c.patch}] ` : ""}${c.displayName} (${c.shortName})`,
        value: c.id,
      }))
  );
}

const VARIABLE_OPTIONS = [
  "date",
  "progress",
  "recruitingRoles",
  "datacenter",
  "language",
  "goal",
  "chouseisanUrl",
] as const;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const resolved = resolveContentOrError(interaction);
  if (!resolved.ok) {
    await interaction.reply({ content: resolved.message, flags: MessageFlags.Ephemeral });
    return;
  }
  const { content, autoDetected } = resolved;
  const templateIndex = interaction.options.getInteger("template") ?? 0;

  const template = findTemplate(content, templateIndex);
  if (!template) {
    await interaction.reply({
      content: `テンプレが見つかりません (index: ${templateIndex}, 登録数: ${content.recruitmentTemplates.length})`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Discord option names are lowercase. Map them to camelCase variable names used in templates.
  const values: Record<string, string | undefined> = {
    date: interaction.options.getString("date") ?? undefined,
    progress: interaction.options.getString("progress") ?? undefined,
    recruitingRoles: interaction.options.getString("recruitingroles") ?? undefined,
    datacenter: interaction.options.getString("datacenter") ?? undefined,
    language: interaction.options.getString("language") ?? undefined,
    goal: interaction.options.getString("goal") ?? undefined,
    chouseisanUrl: interaction.options.getString("chouseisan_url") ?? undefined,
  };

  const { text, unfilledVariables } = renderTemplate(template, values);
  const declaredVars = template.variables.length > 0 ? template.variables : extractPlaceholders(template.template);
  const supportedSet = new Set<string>(VARIABLE_OPTIONS);
  const unsupported = declaredVars.filter((v) => !supportedSet.has(v));

  const lines: string[] = [];
  lines.push(
    `**${content.displayName}** 募集テンプレ (index: ${templateIndex})${
      autoDetected ? " — 固定 channel から自動検出" : ""
    }`
  );
  if (unfilledVariables.length > 0) {
    const supportedUnfilled = unfilledVariables.filter((v) => supportedSet.has(v));
    if (supportedUnfilled.length > 0) {
      lines.push(`> ⚠️ 未入力: \`${supportedUnfilled.join("`, `")}\` (オプションで指定可)`);
    }
    const unsupportedUnfilled = unfilledVariables.filter((v) => !supportedSet.has(v));
    if (unsupportedUnfilled.length > 0) {
      lines.push(`> ℹ️ 手動で埋めてください: \`${unsupportedUnfilled.join("`, `")}\``);
    }
  }
  if (unsupported.length > 0) {
    lines.push(`> 📝 このテンプレで使われる変数のうちコマンドオプション未対応: \`${unsupported.join("`, `")}\``);
  }
  if (template.source) {
    lines.push(`> 出典: ${template.source}`);
  }
  lines.push("");
  lines.push("```");
  lines.push(text);
  lines.push("```");

  await interaction.reply({ content: lines.join("\n").slice(0, 2000) });
}
