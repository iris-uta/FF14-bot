import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { and, eq, gt, asc } from "drizzle-orm";
import { schedules } from "@ff14kotei/db";
import { getDb } from "../lib/db";
import { formatDiscordTime } from "../services/datetime";

export const data = new SlashCommandBuilder()
  .setName("schedules")
  .setDescription("このサーバーの今後の予定一覧");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "このコマンドはサーバー内で実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const now = Date.now();
  const db = getDb();
  const rows = db
    .select()
    .from(schedules)
    .where(and(eq(schedules.guildId, interaction.guildId), gt(schedules.startsAt, now)))
    .orderBy(asc(schedules.startsAt))
    .limit(25)
    .all();

  if (rows.length === 0) {
    await interaction.reply({
      content: "今後の予定はありません。`/schedule` で登録してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = rows.map((r) => {
    const parts: string[] = [
      `**${formatDiscordTime(r.startsAt)}** (${formatDiscordTime(r.startsAt, "R")})`,
      `↳ <#${r.channelId}> — ${r.notifyMinutesBefore}分前通知`,
    ];
    if (r.contentId || r.phaseId) {
      parts.push(`↳ ${[r.contentId, r.phaseId].filter(Boolean).join(" / ")}`);
    }
    if (r.note) parts.push(`↳ ${r.note}`);
    parts.push(`↳ id: \`${r.id}\``);
    return parts.join("\n");
  });

  const embed = new EmbedBuilder()
    .setTitle(`📅 今後の予定 (${rows.length}件)`)
    .setColor(0x6e85b7)
    .setDescription(lines.join("\n\n").slice(0, 4096));

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
