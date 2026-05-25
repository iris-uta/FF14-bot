import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getContentById } from "../lib/contents";
import {
  findPhase,
  getMacrosForPhase,
  splitMacroForDiscord,
} from "../services/phase-content";
import { respondContentOrPhase } from "../services/autocomplete";

export const data = new SlashCommandBuilder()
  .setName("macro")
  .setDescription("Phase のマクロをコピー用 code block で取得 (自分にだけ表示)")
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

  const macros = getMacrosForPhase(content, phaseId);
  if (macros.length === 0) {
    await interaction.reply({
      content: `${content.displayName} ${lookup.phase.name} のマクロは登録されていません。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // First message: header listing variants
  const header = [
    `**${content.displayName} — ${lookup.phase.name}** マクロ (${macros.length}個)`,
    ...macros.map((m, i) => `${i + 1}. ${m.source}`),
  ].join("\n");

  await interaction.reply({ content: header, flags: MessageFlags.Ephemeral });

  // Follow-ups: one code block per macro (split if > 2000 chars)
  for (const macro of macros) {
    if (!macro.text) {
      await interaction.followUp({
        content: `**${macro.source}** — 本文未登録 (${macro.url})`,
        flags: MessageFlags.Ephemeral,
      });
      continue;
    }
    const chunks = splitMacroForDiscord(macro.text);
    for (let i = 0; i < chunks.length; i++) {
      const label = chunks.length > 1 ? `**${macro.source}** (${i + 1}/${chunks.length})` : `**${macro.source}**`;
      await interaction.followUp({
        content: `${label}\n\`\`\`\n${chunks[i]}\n\`\`\``,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
