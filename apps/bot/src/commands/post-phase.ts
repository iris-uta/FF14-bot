import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { findPhase, getMacrosForPhase, splitMacroForDiscord } from "../services/phase-content";
import { buildPhaseEmbed } from "../services/phase-channel-poster";
import { respondContentOrPhase } from "../services/autocomplete";
import { configureContentTypeOption } from "../lib/content-type-choices";
import { resolveContentOrError } from "../services/resolve-content";

export const data = new SlashCommandBuilder()
  .setName("share")
  .setNameLocalizations({ ja: "フェーズ投稿" })
  .setDescription("Phase の攻略情報を現チャネルに投稿 (固定 channel なら content 自動検出)")
  .setDescriptionLocalizations({
    ja: "フェーズの攻略情報 (動画/マクロ/軽減/Tips) を現チャネルに投稿",
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
  const macros = getMacrosForPhase(content, phaseId);

  await interaction.deferReply();

  // Shared embed builder. /share is the "rich" surface — show everything
  // (tips / mitigation / macro list / description). Setup channel intros use
  // the default 'intro' variant which is more compact.
  const embed = buildPhaseEmbed(content, phase, { variant: "full" });
  if (autoDetected) {
    embed.setFooter({ text: "固定 channel から自動検出" });
  }

  await interaction.editReply({ embeds: [embed] });

  for (const macro of macros) {
    if (!macro.text) continue;
    const chunks = splitMacroForDiscord(macro.text);
    for (let i = 0; i < chunks.length; i++) {
      const header = chunks.length > 1 ? `**${macro.source}** (${i + 1}/${chunks.length})\n` : `**${macro.source}**\n`;
      await interaction.followUp({
        content: `${header}\`\`\`\n${chunks[i]}\n\`\`\``,
      });
    }
  }
}
