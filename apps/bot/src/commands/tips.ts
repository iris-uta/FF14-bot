import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getContentById } from "../lib/contents";
import { findPhase } from "../services/phase-content";
import { respondContentOrPhase } from "../services/autocomplete";

export const data = new SlashCommandBuilder()
  .setName("tips")
  .setDescription("Phase の攻略 Tips を表示 (自分にだけ表示)")
  .addStringOption((opt) =>
    opt
      .setName("content")
      .setDescription("コンテンツID")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("phase")
      .setDescription("Phase ID (例: p1, p3)")
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondContentOrPhase(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const contentId = interaction.options.getString("content", true);
  const phaseId = interaction.options.getString("phase", true);

  const content = getContentById(contentId);
  if (!content) {
    await interaction.reply({
      content: `コンテンツが見つかりません: \`${contentId}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lookup = findPhase(content, phaseId);
  if (!lookup) {
    await interaction.reply({
      content: `Phase が見つかりません: \`${phaseId}\` (in ${content.displayName})`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const { phase } = lookup;
  if (phase.tips.length === 0) {
    await interaction.reply({
      content: `${content.displayName} ${phase.name} の Tips は登録されていません。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`💡 ${phase.name} — Tips`)
    .setDescription(phase.tips.map((t, i) => `${i + 1}. ${t}`).join("\n").slice(0, 4096))
    .setColor(0xf0c14b)
    .setFooter({ text: content.displayName });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
