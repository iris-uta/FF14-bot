import {
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { schedules } from "@ff14kotei/db";
import { getDb } from "../lib/db";
import { parseJstDateTime, formatDiscordTime } from "../services/datetime";
import { respondContentOrPhase } from "../services/autocomplete";
import { findStaticForChannel } from "../services/static-manager";

export const data = new SlashCommandBuilder()
  .setName("schedule")
  .setDescription("固定活動の予定を登録 (開始N分前に通知)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
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
  )
  .addStringOption((opt) =>
    opt
      .setName("chouseisan_url")
      .setDescription("調整さん等のURL (任意)。通知時に添付される。")
      .setMaxLength(500)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondContentOrPhase(interaction);
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

  let contentId = interaction.options.getString("content");
  const phaseId = interaction.options.getString("phase");
  const notifyMinutesBefore = interaction.options.getInteger("notify_minutes_before") ?? 10;
  let mention = interaction.options.getString("mention");
  const note = interaction.options.getString("note");
  const chouseisanUrl = interaction.options.getString("chouseisan_url");

  if (chouseisanUrl && !isHttpsUrl(chouseisanUrl)) {
    await interaction.reply({
      content: `chouseisan_url は \`https://\` で始まる URL を指定してください。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Auto-detect static from the channel where the command was invoked
  // (NOT the target `channel` option — we want the *current* context to anchor the static).
  const invokedChannel = interaction.channel;
  const invokedParentId =
    invokedChannel && "parentId" in invokedChannel ? invokedChannel.parentId : null;
  const owningStatic = invokedChannel
    ? findStaticForChannel(interaction.guildId, invokedChannel.id, invokedParentId)
    : null;

  let autoDetectedNotes: string[] = [];
  if (owningStatic) {
    // Auto-fill content from static (if not explicitly set)
    if (!contentId) {
      contentId = owningStatic.contentId;
      autoDetectedNotes.push(`コンテンツ: ${contentId} (固定 channel から)`);
    }
    // Auto-fill mention with static role (if not explicitly set)
    if (!mention) {
      mention = `<@&${owningStatic.roleId}>`;
      autoDetectedNotes.push(`メンション: 固定 role (${owningStatic.name})`);
    }
  }

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
      chouseisanUrl,
      staticId: owningStatic?.id ?? null,
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
  if (chouseisanUrl) {
    embed.addFields({
      name: isChouseisanUrl(chouseisanUrl) ? "調整さん" : "日程調整",
      value: chouseisanUrl,
      inline: false,
    });
  }
  if (autoDetectedNotes.length > 0) {
    embed.setFooter({
      text: `🪄 自動検出: ${autoDetectedNotes.join(" / ")}`,
    });
  }

  await interaction.reply({ embeds: [embed] });
}

function isHttpsUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

export function isChouseisanUrl(s: string): boolean {
  try {
    return new URL(s).hostname.endsWith("chouseisan.com");
  } catch {
    return false;
  }
}
