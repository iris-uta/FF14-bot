/**
 * Button + StringSelect handlers for the /setup wizard.
 *
 * Routes:
 *   setup-wizard:<sid>:type:<value>      → set type, advance
 *   setup-wizard:<sid>:content (select)  → set contentId, advance
 *   setup-wizard:<sid>:mode:<value>      → set mode, advance
 *   setup-wizard:<sid>:strat:<phase>:<s> → record per-phase strategy, advance
 *   setup-wizard:<sid>:create            → run initStatic, replace UI
 *   setup-wizard:<sid>:cancel            → drop session, replace UI
 */
import {
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { getContentById } from "../lib/contents.js";
import { findStaticByName, initStatic } from "./static-manager.js";
import {
  applyAdvancePhase,
  applyContentChoice,
  applyModeChoice,
  applyPopularDefaults,
  applyStrategyChoice,
  applyTypeChoice,
  buildStepMessage,
  deleteWizard,
  getWizard,
  parseWizardCustomId,
  putWizard,
  type WizardState,
} from "./setup-wizard.js";

async function rejectAndAck(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  content: string
): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/**
 * Common preflight: validate session + creator. Returns the state if OK, null
 * if the interaction was rejected (already replied).
 */
async function preflight(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<{ state: WizardState; sessionId: string } | null> {
  const parsed = parseWizardCustomId(interaction.customId);
  if (!parsed) {
    await rejectAndAck(interaction, "ボタン ID が不正です。");
    return null;
  }
  const state = getWizard(parsed.sessionId);
  if (!state) {
    await rejectAndAck(
      interaction,
      "セッションが期限切れです (15 分)。 `/setup name:...` から再度実行してください。"
    );
    return null;
  }
  if (interaction.user.id !== state.creatorId) {
    await rejectAndAck(
      interaction,
      "このウィザードを操作できるのは開始した人のみです。"
    );
    return null;
  }
  return { state, sessionId: parsed.sessionId };
}

// ── Button handler ──────────────────────────────────────────────────────────

export async function handleWizardButton(interaction: ButtonInteraction): Promise<void> {
  const pre = await preflight(interaction);
  if (!pre) return;
  const { state } = pre;
  const parsed = parseWizardCustomId(interaction.customId)!;

  switch (parsed.action) {
    case "type": {
      if (!parsed.payload) return rejectAndAck(interaction, "type が空です。");
      const next = applyTypeChoice(state, parsed.payload);
      putWizard(next);
      const msg = buildStepMessage(next);
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    case "mode": {
      if (!parsed.payload) return rejectAndAck(interaction, "mode が空です。");
      const next = applyModeChoice(state, parsed.payload);
      putWizard(next);
      const msg = buildStepMessage(next);
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    case "strat": {
      if (!parsed.phaseId || !parsed.payload) {
        return rejectAndAck(interaction, "strat payload が不正です。");
      }
      const next = applyStrategyChoice(state, parsed.phaseId, parsed.payload);
      putWizard(next);
      const msg = buildStepMessage(next);
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    case "next": {
      const next = applyAdvancePhase(state);
      putWizard(next);
      const msg = buildStepMessage(next);
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    case "create": {
      await runCreate(interaction, state);
      return;
    }
    case "cancel": {
      deleteWizard(state.sessionId);
      const embed = new EmbedBuilder()
        .setTitle("✖ キャンセルしました")
        .setColor(0x8a8a8a)
        .setDescription(`「${state.name}」 の setup は中止されました。`);
      await interaction.update({ embeds: [embed], components: [] });
      return;
    }
    default:
      return rejectAndAck(interaction, `未対応の action: ${parsed.action}`);
  }
}

// ── StringSelect handler ────────────────────────────────────────────────────

export async function handleWizardSelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  const pre = await preflight(interaction);
  if (!pre) return;
  const { state } = pre;
  const parsed = parseWizardCustomId(interaction.customId)!;

  if (parsed.action !== "content") {
    return rejectAndAck(interaction, `未対応の select action: ${parsed.action}`);
  }
  const value = interaction.values[0];
  if (!value) return rejectAndAck(interaction, "選択値が空です。");
  const next = applyContentChoice(state, value);
  putWizard(next);
  const msg = buildStepMessage(next);
  await interaction.update({ embeds: msg.embeds, components: msg.components });
}

// ── Create handler ──────────────────────────────────────────────────────────

async function runCreate(
  interaction: ButtonInteraction,
  state: WizardState
): Promise<void> {
  // Fill in popular defaults for any unanswered multi-strategy phases
  const finalState = applyPopularDefaults(state);
  const content = getContentById(finalState.contentId!);
  if (!content) {
    await interaction.update({
      content: "❌ コンテンツが見つかりません。",
      embeds: [], components: [],
    });
    return;
  }

  // Last-mile collision check (someone could have raced us)
  if (!interaction.guild) {
    await interaction.update({
      content: "❌ サーバー情報が取得できません。",
      embeds: [], components: [],
    });
    return;
  }
  const dup = findStaticByName(interaction.guild.id, finalState.name);
  if (dup) {
    await interaction.update({
      content: `❌ 固定「${finalState.name}」 は既に存在します。`,
      embeds: [], components: [],
    });
    deleteWizard(finalState.sessionId);
    return;
  }

  // Show "creating…" while we run initStatic (which does several Discord API calls)
  const progress = new EmbedBuilder()
    .setTitle("⏳ 作成中…")
    .setColor(0x6e85b7)
    .setDescription(`「${finalState.name}」 を作成しています。 channels / role を準備中…`);
  await interaction.update({ embeds: [progress], components: [] });

  try {
    const result = await initStatic({
      guild: interaction.guild,
      leaderId: finalState.creatorId,
      name: finalState.name,
      content,
      mode: finalState.mode,
      phaseStrategies: finalState.phaseStrategies,
    });
    deleteWizard(finalState.sessionId);

    const lines: string[] = [
      `**${content.displayName}** (${content.shortName}) 固定 「**${finalState.name}**」 を作成しました。`,
      ``,
      `📁 category: <#${result.category.id}>`,
      `🎭 role: <@&${result.role.id}>`,
      `📺 channels: ${result.utilityChannels.length} utility + ${result.phaseChannels.length} phase`,
      `🎯 slot: ${result.filledSlots} filled / ${result.openSlots} open`,
    ];
    const phaseCount = Object.values(finalState.phaseStrategies).filter(
      (ids) => ids.length > 0
    ).length;
    const totalPicks = Object.values(finalState.phaseStrategies).reduce(
      (sum, ids) => sum + ids.length,
      0
    );
    if (phaseCount > 0) {
      lines.push(`📜 処理法選択: ${phaseCount} phase / 計 ${totalPicks} 処理法`);
    }

    const done = new EmbedBuilder()
      .setTitle("✅ 固定を作成しました")
      .setColor(0x2ecc71)
      .setDescription(lines.join("\n"));
    await interaction.editReply({ embeds: [done], components: [] });
  } catch (err) {
    deleteWizard(finalState.sessionId);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("setup-wizard create failed:", err);
    const failed = new EmbedBuilder()
      .setTitle("❌ 作成失敗")
      .setColor(0xe74c3c)
      .setDescription(`エラー: ${msg.slice(0, 1500)}`);
    await interaction.editReply({ embeds: [failed], components: [] });
  }
}
