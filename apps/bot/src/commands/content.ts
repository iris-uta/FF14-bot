import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getAllContents, getContentById } from "../lib/contents";
import { sortByPatch } from "../lib/content-sort";
import { configureContentTypeOption, checkTypeMatch } from "../lib/content-type-choices";

export const data = new SlashCommandBuilder()
  .setName("content")
  .setNameLocalizations({ ja: "コンテンツ" })
  .setDescription("固定で挑むコンテンツを表示する")
  .setDescriptionLocalizations({ ja: "コンテンツ情報 (Phase一覧・参照URL等) を表示" })
  .addStringOption((opt) => configureContentTypeOption(opt))
  .addStringOption((opt) =>
    opt
      .setName("id")
      .setNameLocalizations({ ja: "コンテンツid" })
      .setDescription("コンテンツID (type で絞り込まれた一覧)")
      .setDescriptionLocalizations({ ja: "コンテンツID (種別で絞られた一覧から選ぶ)" })
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "id") {
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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const typeFilter = interaction.options.getString("type", true);
  const id = interaction.options.getString("id", true);
  const content = getContentById(id);

  if (!content) {
    await interaction.reply({
      content: `コンテンツが見つかりません: \`${id}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mismatchMsg = checkTypeMatch(content.type, typeFilter, id);
  if (mismatchMsg) {
    await interaction.reply({ content: mismatchMsg, flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${content.displayName} (${content.shortName})`)
    .setDescription(
      [
        `**種別**: ${content.type}`,
        content.patch ? `**実装パッチ**: ${content.patch}` : null,
        `**Phase数**: ${content.phases.length}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .addFields(
      {
        name: "Phase一覧",
        value:
          content.phases.map((p) => `\`${p.id}\` — ${p.name}`).join("\n") || "（なし）",
      },
      ...(content.references.primary
        ? [
            {
              name: "主参照",
              value: content.references.primary,
              inline: true,
            },
          ]
        : [])
    );

  if (content.references.urls.length > 0) {
    embed.addFields({
      name: "参照URL",
      value: content.references.urls.map((u) => `<${u}>`).join("\n"),
    });
  }

  await interaction.reply({ embeds: [embed] });
}
