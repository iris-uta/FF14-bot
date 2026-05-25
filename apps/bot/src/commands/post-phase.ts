import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getAllContents, getContentById } from "../lib/contents";
import { findPhase, getMacrosForPhase, splitMacroForDiscord } from "../services/phase-content";

export const data = new SlashCommandBuilder()
  .setName("post-phase")
  .setDescription("指定 Phase の攻略情報（動画・処理方・マクロ・tips）を現在のチャネルに投稿")
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
  const focused = interaction.options.getFocused(true);
  const lower = focused.value.toLowerCase();

  if (focused.name === "content") {
    const matches = getAllContents()
      .filter(
        (c) =>
          c.id.toLowerCase().includes(lower) ||
          c.displayName.toLowerCase().includes(lower) ||
          c.shortName.toLowerCase().includes(lower)
      )
      .slice(0, 25)
      .map((c) => ({ name: `${c.displayName} (${c.shortName})`, value: c.id }));
    await interaction.respond(matches);
    return;
  }

  if (focused.name === "phase") {
    const contentId = interaction.options.getString("content");
    const content = contentId ? getContentById(contentId) : null;
    if (!content) {
      await interaction.respond([]);
      return;
    }
    const matches = content.phases
      .filter(
        (p) =>
          p.id.toLowerCase().includes(lower) || p.name.toLowerCase().includes(lower)
      )
      .slice(0, 25)
      .map((p) => ({ name: `${p.id} — ${p.name}`, value: p.id }));
    await interaction.respond(matches);
  }
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
  const macros = getMacrosForPhase(content, phaseId);

  await interaction.deferReply();

  const embed = new EmbedBuilder()
    .setTitle(`${phase.name} — ${content.displayName}`)
    .setColor(0x6e85b7);

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

  // Follow-up: post each macro body as a code block for easy copy.
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
