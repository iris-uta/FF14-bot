import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { findPhase } from "../services/phase-content";
import { respondContentOrPhase } from "../services/autocomplete";
import { configureContentTypeOption } from "../lib/content-type-choices";
import { resolveContentOrError } from "../services/resolve-content";

export const data = new SlashCommandBuilder()
  .setName("tips")
  .setNameLocalizations({ ja: "ヒント" })
  .setDescription("Phase の攻略 Tips を表示 (固定 channel なら content 自動検出)")
  .setDescriptionLocalizations({
    ja: "フェーズの攻略ヒントを表示 (固定 channel 内なら自動検出)",
  })
  .addStringOption((opt) =>
    opt
      .setName("phase")
      .setNameLocalizations({ ja: "フェーズ" })
      .setDescription("Phase ID (例: p1, p3)")
      .setDescriptionLocalizations({ ja: "フェーズID (例: p1, p3)" })
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) => configureContentTypeOption(opt, { required: false }))
  .addStringOption((opt) =>
    opt
      .setName("content")
      .setNameLocalizations({ ja: "コンテンツ" })
      .setDescription("コンテンツID (省略時は固定 channel から自動検出)")
      .setDescriptionLocalizations({ ja: "コンテンツID (省略時は固定 channel から自動検出)" })
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondContentOrPhase(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const resolved = resolveContentOrError(interaction);
  if (!resolved.ok) {
    await interaction.reply({ content: resolved.message, flags: MessageFlags.Ephemeral });
    return;
  }
  const { content, autoDetected } = resolved;
  const phaseId = interaction.options.getString("phase", true);

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
    .setFooter({
      text: `${content.displayName}${autoDetected ? " — 固定 channel から自動検出" : ""}`,
    });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
