import {
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { schedules } from "@ff14kotei/db";
import { getDb } from "../lib/db";
import { getAllContents, getContentById } from "../lib/contents";
import { parseJstDateTime, formatDiscordTime } from "../services/datetime";

export const data = new SlashCommandBuilder()
  .setName("schedule")
  .setDescription("固定活動の予定を登録 (開始N分前に通知)")
  .addStringOption((opt) =>
    opt
      .setName("when")
      .setDescription("開始時刻 (JST、例: 2025-06-01 21:00)")
      .setRequired(true)
      .setMaxLength(40)
  )
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("通知先チャネル (省略時は現在のチャネル)")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  )
  .addStringOption((opt) =>
    opt.setName("content").setDescription("コンテンツID (例: fru)").setAutocomplete(true).setMaxLength(40)
  )
  .addStringOption((opt) =>
    opt.setName("phase").setDescription("Phase ID (例: p3)").setAutocomplete(true).setMaxLength(40)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("notify_minutes_before")
      .setDescription("何分前に通知するか (default 10)")
      .setMinValue(0)
      .setMaxValue(1440)
  )
  .addStringOption((opt) =>
    opt
      .setName("mention")
      .setDescription("通知時のメンション (例: @here, <@&role-id>)")
      .setMaxLength(200)
  )
  .addStringOption((opt) =>
    opt.setName("note").setDescription("自由文 (例: P3練習)").setMaxLength(500)
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
    await interaction.respond(
      content.phases
        .filter(
          (p) => p.id.toLowerCase().includes(lower) || p.name.toLowerCase().includes(lower)
        )
        .slice(0, 25)
        .map((p) => ({ name: `${p.id} — ${p.name}`, value: p.id }))
    );
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "このコマンドはサーバー内で実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const whenInput = interaction.options.getString("when", true);
  const startsAt = parseJstDateTime(whenInput);
  if (startsAt === null) {
    await interaction.reply({
      content: `日時の形式が不正です: \`${whenInput}\`\n例: \`2025-06-01 21:00\` (JST)`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const now = Date.now();
  if (startsAt <= now) {
    await interaction.reply({
      content: `過去の日時は登録できません: ${formatDiscordTime(startsAt)}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.options.getChannel("channel") ?? interaction.channel;
  if (!channel || !("id" in channel)) {
    await interaction.reply({
      content: "通知先チャネルが特定できません。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const contentId = interaction.options.getString("content");
  const phaseId = interaction.options.getString("phase");
  const notifyMinutesBefore = interaction.options.getInteger("notify_minutes_before") ?? 10;
  const mention = interaction.options.getString("mention");
  const note = interaction.options.getString("note");

  const id = randomUUID();
  const db = getDb();
  db.insert(schedules)
    .values({
      id,
      guildId: interaction.guildId,
      channelId: channel.id,
      contentId,
      phaseId,
      startsAt,
      notifyMinutesBefore,
      mention,
      note,
      createdAt: now,
      createdBy: interaction.user.id,
    })
    .run();

  const notifyAt = startsAt - notifyMinutesBefore * 60_000;

  const embed = new EmbedBuilder()
    .setTitle("📅 予定を登録しました")
    .setColor(0x6e85b7)
    .addFields(
      { name: "ID", value: `\`${id}\``, inline: false },
      { name: "開始", value: `${formatDiscordTime(startsAt)} (${formatDiscordTime(startsAt, "R")})`, inline: false },
      { name: "通知先", value: `<#${channel.id}>`, inline: true },
      { name: "通知時刻", value: `${formatDiscordTime(notifyAt)} (${notifyMinutesBefore}分前)`, inline: true }
    );

  if (contentId) embed.addFields({ name: "コンテンツ", value: contentId, inline: true });
  if (phaseId) embed.addFields({ name: "Phase", value: phaseId, inline: true });
  if (note) embed.addFields({ name: "メモ", value: note, inline: false });
  if (mention) embed.addFields({ name: "メンション", value: mention, inline: false });

  await interaction.reply({ embeds: [embed] });
}
