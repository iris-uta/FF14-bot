import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import {
  createRule,
  deleteRule,
  formatRuleSchedule,
  getRule,
  listRulesInGuild,
  WEEKDAY_LABELS,
  computeNextOccurrence,
} from "../services/recurring-scheduler";
import { findStaticForChannel } from "../services/static-manager";
import { formatDiscordTime } from "../services/datetime";
import { getContentById } from "../lib/contents";

const WEEKDAY_CHOICES = [
  { name: "sun (日)", value: 0 },
  { name: "mon (月)", value: 1 },
  { name: "tue (火)", value: 2 },
  { name: "wed (水)", value: 3 },
  { name: "thu (木)", value: 4 },
  { name: "fri (金)", value: 5 },
  { name: "sat (土)", value: 6 },
];

export const data = new SlashCommandBuilder()
  .setName("recurring")
  .setNameLocalizations({ ja: "定期予定" })
  .setDescription("毎週決まった曜日 + 時刻に予定を自動登録 (alert-worker と連携)")
  .setDescriptionLocalizations({ ja: "毎週決まった曜日 + 時刻に予定を自動登録 (alert-worker と連携)" })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setNameLocalizations({ ja: "登録" })
      .setDescription("新しい定期予定を登録")
      .setDescriptionLocalizations({ ja: "新しい定期予定を登録" })
      .addIntegerOption((opt) =>
        opt
          .setName("day")
          .setNameLocalizations({ ja: "曜日" })
          .setDescription("曜日 (JST)")
          .setDescriptionLocalizations({ ja: "曜日 (JST)" })
          .setRequired(true)
          .addChoices(...WEEKDAY_CHOICES)
      )
      .addStringOption((opt) =>
        opt
          .setName("time")
          .setNameLocalizations({ ja: "時刻" })
          .setDescription("開始時刻 (JST、24h、例: 21:00)")
          .setDescriptionLocalizations({ ja: "開始時刻 (JST、24h、例: 21:00)" })
          .setRequired(true)
          .setMaxLength(5)
      )
      .addStringOption((opt) =>
        opt
          .setName("content")
          .setNameLocalizations({ ja: "コンテンツ" })
          .setDescription("コンテンツID (省略時は固定 channel から自動検出)")
          .setDescriptionLocalizations({ ja: "コンテンツID (省略時は固定 channel から自動検出)" })
          .setMaxLength(40)
      )
      .addStringOption((opt) =>
        opt
          .setName("mention")
          .setNameLocalizations({ ja: "メンション" })
          .setDescription("通知メンション (固定 channel なら role 自動)")
          .setDescriptionLocalizations({ ja: "通知メンション (固定 channel なら role 自動)" })
          .setMaxLength(200)
      )
      .addStringOption((opt) =>
        opt
          .setName("note")
          .setNameLocalizations({ ja: "メモ" })
          .setDescription("自由文 (例: 練習日)")
          .setDescriptionLocalizations({ ja: "自由文 (例: 練習日)" })
          .setMaxLength(200)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("notify_minutes_before")
          .setNameLocalizations({ ja: "通知何分前" })
          .setDescription("開始 N 分前に通知 (default: 10)")
          .setDescriptionLocalizations({ ja: "開始 N 分前に通知 (default: 10)" })
          .setMinValue(0)
          .setMaxValue(1440)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setNameLocalizations({ ja: "一覧" })
      .setDescription("このサーバーの定期予定一覧 (作成者は誰でも閲覧可)")
      .setDescriptionLocalizations({ ja: "このサーバーの定期予定一覧" })
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setNameLocalizations({ ja: "削除" })
      .setDescription("定期予定を削除 (作成者のみ)")
      .setDescriptionLocalizations({ ja: "定期予定を削除 (作成者のみ)" })
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("削除する rule ID")
          .setRequired(true)
          .setAutocomplete(true)
          .setMaxLength(40)
      )
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "id") {
    await interaction.respond([]);
    return;
  }
  const list = listRulesInGuild(interaction.guildId)
    .filter((r) => r.id.startsWith(focused.value))
    .slice(0, 25)
    .map((r) => ({
      name: `${formatRuleSchedule(r)} (${r.id.slice(0, 8)})`.slice(0, 100),
      value: r.id,
    }));
  await interaction.respond(list);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "このコマンドはサーバー内で実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const sub = interaction.options.getSubcommand(true);
  if (sub === "set") return handleSet(interaction);
  if (sub === "list") return handleList(interaction);
  if (sub === "remove") return handleRemove(interaction);
  await interaction.reply({ content: `Unknown subcommand: ${sub}`, flags: MessageFlags.Ephemeral });
}

async function handleSet(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const channel = interaction.channel;
  if (!channel || !("id" in channel)) {
    await interaction.reply({
      content: "現在のチャネルが特定できません。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const weekday = interaction.options.getInteger("day", true);
  const timeStr = interaction.options.getString("time", true);
  const parsedTime = parseHHmm(timeStr);
  if (!parsedTime) {
    await interaction.reply({
      content: `時刻の形式が不正です: \`${timeStr}\` (例: \`21:00\`)`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const { hour, minute } = parsedTime;

  let contentId = interaction.options.getString("content");
  let mention = interaction.options.getString("mention");
  const note = interaction.options.getString("note");
  const notifyMinutesBefore = interaction.options.getInteger("notify_minutes_before") ?? 10;

  // Static auto-detect
  const parentId = "parentId" in channel ? channel.parentId : null;
  const owningStatic = findStaticForChannel(guildId, channel.id, parentId);

  let autoDetectedNotes: string[] = [];
  if (owningStatic) {
    if (!contentId) {
      contentId = owningStatic.contentId;
      autoDetectedNotes.push(`コンテンツ: ${contentId}`);
    }
    if (!mention) {
      mention = `<@&${owningStatic.roleId}>`;
      autoDetectedNotes.push(`mention: 固定 role`);
    }
  }

  if (contentId && !getContentById(contentId)) {
    await interaction.reply({
      content: `コンテンツが見つかりません: \`${contentId}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const id = randomUUID();
  const now = Date.now();
  createRule({
    id,
    guildId,
    channelId: channel.id,
    contentId: contentId ?? null,
    phaseId: null,
    staticId: owningStatic?.id ?? null,
    weekday,
    hourJst: hour,
    minuteJst: minute,
    notifyMinutesBefore,
    mention: mention ?? null,
    note: note ?? null,
    active: true,
    lastInsertedAt: null,
    createdAt: now,
    createdBy: interaction.user.id,
  });

  const nextAt = computeNextOccurrence(weekday, hour, minute, now);
  const embed = new EmbedBuilder()
    .setTitle("🔁 定期予定を登録しました")
    .setColor(0x6e85b7)
    .addFields(
      { name: "ID", value: `\`${id.slice(0, 8)}\``, inline: true },
      { name: "曜日 + 時刻", value: `${WEEKDAY_LABELS[weekday]}曜 ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} JST`, inline: true },
      { name: "通知先", value: `<#${channel.id}>`, inline: true },
      { name: "次回", value: `${formatDiscordTime(nextAt, "F")} (${formatDiscordTime(nextAt, "R")})`, inline: false }
    );
  if (contentId) embed.addFields({ name: "コンテンツ", value: contentId, inline: true });
  if (mention) embed.addFields({ name: "メンション", value: mention, inline: true });
  if (note) embed.addFields({ name: "メモ", value: note, inline: false });
  if (autoDetectedNotes.length > 0) {
    embed.setFooter({ text: `🪄 自動検出: ${autoDetectedNotes.join(" / ")}` });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const rules = listRulesInGuild(interaction.guildId!);
  if (rules.length === 0) {
    await interaction.reply({
      content: "このサーバーにはまだ定期予定がありません。 `/recurring set` で登録してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = rules.map((r) => {
    const status = r.active ? "🟢" : "⏸️";
    const sched = formatRuleSchedule(r);
    const channel = `<#${r.channelId}>`;
    const noteStr = r.note ? ` — ${r.note}` : "";
    return `${status} **${sched}** → ${channel} \`${r.id.slice(0, 8)}\`${noteStr}`;
  });
  const embed = new EmbedBuilder()
    .setTitle(`🔁 定期予定 (${rules.length} 件)`)
    .setColor(0x6e85b7)
    .setDescription(lines.join("\n").slice(0, 4000));
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getString("id", true);
  const rule = getRule(id);
  if (!rule || rule.guildId !== interaction.guildId) {
    await interaction.reply({
      content: `定期予定が見つかりません: \`${id}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (rule.createdBy !== interaction.user.id) {
    await interaction.reply({
      content: "削除できるのは作成者のみです。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  deleteRule(id);
  await interaction.reply({
    content: `🗑️ 削除しました: \`${id.slice(0, 8)}\` (${formatRuleSchedule(rule)})`,
    flags: MessageFlags.Ephemeral,
  });
}

function parseHHmm(s: string): { hour: number; minute: number } | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number.parseInt(m[1], 10);
  const minute = Number.parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}
