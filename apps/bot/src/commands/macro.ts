import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import {
  findPhase,
  getMacrosForPhase,
  splitMacroForDiscord,
} from "../services/phase-content";
import { respondContentOrPhase } from "../services/autocomplete";
import { configureContentTypeOption } from "../lib/content-type-choices";
import { resolveContentOrError } from "../services/resolve-content";

export const data = new SlashCommandBuilder()
  .setName("macro")
  .setDescription("Phase のマクロを取得 (固定 channel なら content 自動検出、自分にだけ表示)")
  .addStringOption((opt) =>
    opt
      .setName("phase")
      .setDescription("Phase ID (例: p1, p3)")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) => configureContentTypeOption(opt, { required: false }))
  .addStringOption((opt) =>
    opt
      .setName("content")
      .setDescription("コンテンツID (省略時は固定 channel から自動検出)")
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

  const macros = getMacrosForPhase(content, phaseId);
  if (macros.length === 0) {
    await interaction.reply({
      content: `${content.displayName} ${lookup.phase.name} のマクロは登録されていません。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const header = [
    `**${content.displayName} — ${lookup.phase.name}** マクロ (${macros.length}個)${
      autoDetected ? " — 固定 channel から自動検出" : ""
    }`,
    ...macros.map((m, i) => `${i + 1}. ${m.source}`),
  ].join("\n");

  await interaction.reply({ content: header, flags: MessageFlags.Ephemeral });

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
