import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { findPhase, getMacrosForPhase, splitMacroForDiscord } from "../services/phase-content";
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

  const embed = new EmbedBuilder()
    .setTitle(`${phase.name} — ${content.displayName}`)
    .setColor(0x6e85b7);

  if (autoDetected) {
    embed.setFooter({ text: "固定 channel から自動検出" });
  }

  if (phase.description) {
    embed.setDescription(phase.description.slice(0, 4096));
  }

  if (phase.strategies.length > 0) {
    embed.addFields({
      name: "処理方",
      value: phase.strategies
        .map((s) => `**${s.name}**${s.description ? ` — ${s.description.split("\n")[0]}` : ""}`)
        .join("\n")
        .slice(0, 1024),
    });
  }

  if (phase.videos.length > 0) {
    embed.addFields({
      name: "攻略動画",
      value: phase.videos
        .map((v) => `[${v.title}](${v.url})${v.author ? ` — ${v.author}` : ""}`)
        .join("\n")
        .slice(0, 1024),
    });
  }

  if (phase.tips.length > 0) {
    embed.addFields({
      name: "Tips",
      value: phase.tips.map((t) => `• ${t}`).join("\n").slice(0, 1024),
    });
  }

  if (phase.mitigation) {
    embed.addFields({
      name: "軽減表",
      value: `[${phase.mitigation.name}](${phase.mitigation.url})${
        phase.mitigation.copyable ? "（コピー推奨）" : ""
      }`,
    });
  }

  if (macros.length > 0) {
    embed.addFields({
      name: `マクロ (${macros.length}個)`,
      value: macros
        .map((m, i) => `${i + 1}. [${m.source}](${m.url})`)
        .join("\n")
        .slice(0, 1024),
    });
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
