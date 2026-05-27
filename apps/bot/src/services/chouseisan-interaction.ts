import {
  EmbedBuilder,
  MessageFlags,
  type StringSelectMenuInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { schedules } from "@ff14kotei/db";
import { getDb } from "../lib/db";
import { takeChouseisanContext } from "./chouseisan-context";
import { formatDiscordTime } from "./datetime";

export const SELECT_PREFIX = "chouseisan-pick:";

/**
 * Handle select-menu click from /from-chouseisan.
 * customId: `chouseisan-pick:${contextId}`
 * values: [string(candidate index)]
 */
export async function handleChouseisanPick(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  const contextId = interaction.customId.slice(SELECT_PREFIX.length);
  const ctx = takeChouseisanContext(contextId);
  if (!ctx) {
    await interaction.reply({
      content:
        "選択肢の有効期限が切れました (15分)。`/from-chouseisan` から再度実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Only the original invoker may pick (avoid grief)
  if (interaction.user.id !== ctx.creatorId) {
    await interaction.reply({
      content: "この選択は実行した本人のみ操作できます。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const idx = Number.parseInt(interaction.values[0] ?? "", 10);
  const cand = ctx.candidates[idx];
  if (!cand || cand.startsAt === null) {
    await interaction.reply({
      content: "候補が見つかりませんでした。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // If candidate had no time, apply default_time
  let startsAt = cand.startsAt;
  if (!cand.hasTime && ctx.defaultTime) {
    const m = ctx.defaultTime.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const hour = Number(m[1]);
      const minute = Number(m[2]);
      const JST = 9 * 60 * 60_000;
      const jst = new Date(startsAt + JST);
      const replaced = Date.UTC(
        jst.getUTCFullYear(),
        jst.getUTCMonth(),
        jst.getUTCDate(),
        hour,
        minute,
        0,
        0
      );
      startsAt = replaced - JST;
    }
  }

  if (startsAt <= Date.now()) {
    await interaction.reply({
      content: `その候補は既に過去になっています: ${formatDiscordTime(startsAt)}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!ctx.channelId) {
    await interaction.reply({
      content: "投稿先 channel が特定できませんでした。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Insert schedule row — alert-worker will fire at startsAt - notifyMinutesBefore
  const scheduleId = randomUUID();
  const now = Date.now();
  getDb()
    .insert(schedules)
    .values({
      id: scheduleId,
      guildId: ctx.guildId,
      channelId: ctx.channelId,
      contentId: null,
      phaseId: null,
      startsAt,
      notifyMinutesBefore: ctx.notifyMinutesBefore,
      mention: ctx.mention,
      note: `[調整さん] ${ctx.eventName} (${cand.dateString})`,
      chouseisanUrl: null,
      staticId: ctx.staticId,
      createdAt: now,
      createdBy: ctx.creatorId,
    })
    .run();

  const notifyAt = startsAt - ctx.notifyMinutesBefore * 60_000;
  const embed = new EmbedBuilder()
    .setTitle("📅 調整さんから予定登録しました")
    .setColor(0x6e85b7)
    .addFields(
      { name: "イベント", value: ctx.eventName, inline: false },
      { name: "選んだ候補", value: `**${cand.dateString}** (⭕${cand.yes})`, inline: false },
      { name: "開始", value: `${formatDiscordTime(startsAt)} (${formatDiscordTime(startsAt, "R")})`, inline: false },
      { name: "通知先", value: `<#${ctx.channelId}>`, inline: true },
      { name: "通知時刻", value: `${formatDiscordTime(notifyAt)} (${ctx.notifyMinutesBefore}分前)`, inline: true }
    );
  if (ctx.mention) embed.addFields({ name: "メンション", value: ctx.mention, inline: false });

  // Replace the select-menu message with the confirmation (no more buttons)
  await interaction.update({ embeds: [embed], components: [], content: undefined });
}
