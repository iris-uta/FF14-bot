import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import {
  extractChouseisanHash,
  fetchChouseisanData,
  ChouseisanFetchError,
} from "../services/chouseisan-csv";
import { findStaticForChannel } from "../services/static-manager";
import { putChouseisanContext } from "../services/chouseisan-context";
import { formatDiscordTime } from "../services/datetime";

export const data = new SlashCommandBuilder()
  .setName("from-chouseisan")
  .setNameLocalizations({ ja: "調整さん取込" })
  .setDescription("調整さんの URL から候補日を読み込んで、選んだ日を /book と同じ予定として登録")
  .setDescriptionLocalizations({
    ja: "調整さんの URL から候補日を読み込んで、選んだ日を予定として登録",
  })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
  .addStringOption((opt) =>
    opt
      .setName("url")
      .setNameLocalizations({ ja: "url" })
      .setDescription("調整さん URL (例: https://chouseisan.com/s?h=...)")
      .setDescriptionLocalizations({ ja: "調整さん URL (例: https://chouseisan.com/s?h=...)" })
      .setRequired(true)
      .setMaxLength(500)
  )
  .addStringOption((opt) =>
    opt
      .setName("default_time")
      .setNameLocalizations({ ja: "標準時刻" })
      .setDescription("時刻なし候補のデフォルト時刻 (JST、例: 21:00)")
      .setDescriptionLocalizations({ ja: "時刻なし候補のデフォルト時刻 (JST、例: 21:00)" })
      .setMaxLength(5)
  )
  .addStringOption((opt) =>
    opt
      .setName("mention")
      .setNameLocalizations({ ja: "メンション" })
      .setDescription("通知メンション (固定 channel なら role 自動)")
      .setDescriptionLocalizations({ ja: "通知メンション (固定 channel なら role 自動)" })
      .setMaxLength(200)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("notify_minutes_before")
      .setNameLocalizations({ ja: "通知何分前" })
      .setDescription("開始 N 分前に通知 (default 10)")
      .setDescriptionLocalizations({ ja: "開始 N 分前に通知 (default 10)" })
      .setMinValue(0)
      .setMaxValue(1440)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "このコマンドはサーバー内で実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const url = interaction.options.getString("url", true);
  const hash = extractChouseisanHash(url);
  if (!hash) {
    await interaction.reply({
      content:
        `chouseisan の URL 形式が不正です: \`${url}\`\n例: \`https://chouseisan.com/s?h=abc123...\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const defaultTime = interaction.options.getString("default_time");
  if (defaultTime) {
    const m = defaultTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
      await interaction.reply({
        content: `default_time の形式が不正です: \`${defaultTime}\` (例: \`21:00\`)`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let data;
  try {
    data = await fetchChouseisanData(hash);
  } catch (err) {
    const msg = err instanceof ChouseisanFetchError ? err.message : "chouseisan の取得に失敗しました";
    await interaction.editReply({ content: `❌ ${msg}` });
    return;
  }

  // Filter to future candidates only (past dates can't be booked)
  const now = Date.now();
  const futureCandidates = data.candidates.filter(
    (c) => c.startsAt !== null && c.startsAt >= now
  );

  if (futureCandidates.length === 0) {
    await interaction.editReply({
      content: `📋 **${data.eventName}**\n未来の候補日がありません (全 ${data.candidates.length} 件は過去 or 日時不明)`,
    });
    return;
  }

  // Auto-detect static for channel + mention
  const channel = interaction.channel;
  const parentId = channel && "parentId" in channel ? channel.parentId : null;
  const owningStatic = channel
    ? findStaticForChannel(interaction.guildId, channel.id, parentId)
    : null;
  let mention = interaction.options.getString("mention");
  if (!mention && owningStatic) mention = `<@&${owningStatic.roleId}>`;
  const notifyMinutesBefore = interaction.options.getInteger("notify_minutes_before") ?? 10;

  // Stash context for the select-menu click handler. Short TTL to limit memory.
  const contextId = randomUUID();
  putChouseisanContext(contextId, {
    eventName: data.eventName,
    candidates: futureCandidates,
    channelId: channel?.id ?? null,
    guildId: interaction.guildId,
    staticId: owningStatic?.id ?? null,
    mention: mention ?? null,
    notifyMinutesBefore,
    defaultTime: defaultTime ?? null,
    creatorId: interaction.user.id,
    createdAt: now,
  });

  // Build the embed showing all candidates with counts, winner highlighted
  const sorted = [...futureCandidates].sort((a, b) => b.yes - a.yes);
  const winner = sorted[0];

  const embed = new EmbedBuilder()
    .setTitle(`📋 ${data.eventName}`)
    .setColor(0x6e85b7)
    .setDescription(
      [
        `[chouseisan で開く](https://chouseisan.com/s?h=${hash})`,
        `候補 ${futureCandidates.length} 件 (過去 ${data.candidates.length - futureCandidates.length} 件は除外)`,
      ].join("\n")
    );

  const lines = sorted.map((c) => {
    const isWinner = winner && c === winner && c.yes > 0;
    const trophy = isWinner ? "🏆 " : "▸ ";
    const tag = !c.hasTime ? " ⏰未指定" : "";
    return `${trophy}**${c.dateString}**${tag} — ⭕${c.yes} ❌${c.no} 🤔${c.maybe}`;
  });
  embed.addFields({
    name: "候補日 (⭕降順)",
    value: lines.join("\n").slice(0, 1024),
    inline: false,
  });

  if (winner && winner.yesNames.length > 0) {
    embed.addFields({
      name: `🏆 最多 yes (${winner.yes} 名)`,
      value: winner.yesNames.slice(0, 20).join(", ").slice(0, 1024),
      inline: false,
    });
  }

  // Select menu (max 25 options, fine for up to ~25 candidates)
  const select = new StringSelectMenuBuilder()
    .setCustomId(`chouseisan-pick:${contextId}`)
    .setPlaceholder("登録する候補日を選んでください…")
    .addOptions(
      sorted.slice(0, 25).map((c) => {
        const idxInList = futureCandidates.indexOf(c);
        return {
          label: `${c.dateString} (⭕${c.yes})`.slice(0, 100),
          description: `${formatJstReadable(c.startsAt!)}${!c.hasTime ? " · 時刻未指定" : ""}`.slice(0, 100),
          value: String(idxInList),
          emoji: winner && c === winner && c.yes > 0 ? "🏆" : undefined,
        };
      })
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  await interaction.editReply({
    embeds: [embed],
    components: [row],
    content: defaultTime
      ? `default_time: ${defaultTime} JST · notify_minutes_before: ${notifyMinutesBefore}`
      : `時刻なし候補は default_time オプション (例: 21:00) で補完できます · notify_minutes_before: ${notifyMinutesBefore}`,
  });
}

function formatJstReadable(unixMs: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(unixMs)) + " JST";
}
