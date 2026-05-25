import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getAllContents, getContentById } from "../lib/contents";

export const data = new SlashCommandBuilder()
  .setName("content")
  .setDescription("固定で挑むコンテンツを表示する")
  .addStringOption((opt) =>
    opt
      .setName("id")
      .setDescription("コンテンツID（autocomplete対応）")
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const contents = getAllContents();
  const matches = contents
    .filter(
      (c) =>
        c.id.toLowerCase().includes(focused) ||
        c.displayName.toLowerCase().includes(focused) ||
        c.shortName.toLowerCase().includes(focused)
    )
    .slice(0, 25)
    .map((c) => ({
      name: `${c.displayName} (${c.shortName})`,
      value: c.id,
    }));
  await interaction.respond(matches);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getString("id", true);
  const content = getContentById(id);

  if (!content) {
    await interaction.reply({
      content: `コンテンツが見つかりません: \`${id}\``,
      ephemeral: true,
    });
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
