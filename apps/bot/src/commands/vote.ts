import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import {
  getVote,
  getResponses,
  closeVote,
  listOpenVotesInGuild,
  listVotesInGuild,
  pickRankedCandidate,
  renderVoteMessage,
  getCandidates,
} from "../services/vote";
import { parseJstDateTime, formatDiscordTime } from "../services/datetime";
import { findStaticForChannel } from "../services/static-manager";
import { putDraft } from "../services/vote-draft";
import { schedules, type Vote } from "@ff14kotei/db";
import { getDb } from "../lib/db";
import { EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("vote")
  .setNameLocalizations({ ja: "投票" })
  .setDescription("日程候補を投票してもらう (調整さん代替)")
  .setDescriptionLocalizations({ ja: "日程候補を投票してもらう (調整さん代替)" })
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
  .addSubcommand((sub) =>
    sub
      .setName("new")
      .setNameLocalizations({ ja: "作成" })
      .setDescription("新しい投票を作成 (候補は modal で入力、2〜5 件)")
      .setDescriptionLocalizations({ ja: "新しい投票を作成 (候補は modal で入力、2〜5 件)" })
      .addStringOption((opt) =>
        opt
          .setName("title")
          .setNameLocalizations({ ja: "題名" })
          .setDescription("投票のタイトル (例: 次回固定日)")
          .setDescriptionLocalizations({ ja: "投票のタイトル (例: 次回固定日)" })
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption((opt) =>
        opt
          .setName("closes_at")
          .setNameLocalizations({ ja: "締切日時" })
          .setDescription("締切 (JST、例: 2026-06-01 21:00)。省略時は手動締切のみ。")
          .setDescriptionLocalizations({ ja: "締切 (JST、例: 2026-06-01 21:00)。省略時は手動締切のみ。" })
          .setMaxLength(40)
      )
      .addStringOption((opt) =>
        opt
          .setName("mention")
          .setNameLocalizations({ ja: "メンション" })
          .setDescription("投稿時のメンション (例: @here。固定 channel なら role 自動)")
          .setDescriptionLocalizations({ ja: "投稿時のメンション (例: @here。固定 channel なら role 自動)" })
          .setMaxLength(200)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("remind_hours_before")
          .setNameLocalizations({ ja: "リマインダー何時間前" })
          .setDescription("締切何時間前にリマインダー (closes_at 必須)。例: 12")
          .setDescriptionLocalizations({ ja: "締切何時間前にリマインダー (closes_at 必須)" })
          .setMinValue(1)
          .setMaxValue(168)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("close")
      .setNameLocalizations({ ja: "締切" })
      .setDescription("投票を締め切る (以後ボタンが押せない)")
      .setDescriptionLocalizations({ ja: "投票を締め切る (以後ボタンが押せない)" })
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setNameLocalizations({ ja: "id" })
          .setDescription("投票 ID")
          .setDescriptionLocalizations({ ja: "投票 ID" })
          .setRequired(true)
          .setAutocomplete(true)
          .setMaxLength(40)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setNameLocalizations({ ja: "結果" })
      .setDescription("投票の現在の結果を ephemeral で表示")
      .setDescriptionLocalizations({ ja: "投票の現在の結果を ephemeral で表示" })
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setNameLocalizations({ ja: "id" })
          .setDescription("投票 ID")
          .setDescriptionLocalizations({ ja: "投票 ID" })
          .setRequired(true)
          .setAutocomplete(true)
          .setMaxLength(40)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("book")
      .setNameLocalizations({ ja: "予定化" })
      .setDescription("投票結果の top 候補を /book と同じ形式の予定として登録")
      .setDescriptionLocalizations({ ja: "投票結果の top 候補を予定として登録 (alert-worker が通知)" })
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setNameLocalizations({ ja: "id" })
          .setDescription("投票 ID")
          .setDescriptionLocalizations({ ja: "投票 ID" })
          .setRequired(true)
          .setAutocomplete(true)
          .setMaxLength(40)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("rank")
          .setNameLocalizations({ ja: "順位" })
          .setDescription("yes 数が N 番目の候補を予定化 (default: 1 = 最多)")
          .setDescriptionLocalizations({ ja: "yes 数が N 番目の候補を予定化 (default: 1 = 最多)" })
          .setMinValue(1)
          .setMaxValue(5)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("notify_minutes_before")
          .setNameLocalizations({ ja: "通知何分前" })
          .setDescription("開始の何分前に通知するか (default: 10)")
          .setDescriptionLocalizations({ ja: "開始の何分前に通知するか (default: 10)" })
          .setMinValue(0)
          .setMaxValue(1440)
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
  // /vote close only suggests open votes; /vote info and /vote book suggest all.
  const sub = interaction.options.getSubcommand();
  const pool: Vote[] =
    sub === "close"
      ? listOpenVotesInGuild(interaction.guildId, 25)
      : listVotesInGuild(interaction.guildId, 25);
  const q = focused.value.toLowerCase();
  const filtered = pool
    .filter((v) => v.title.toLowerCase().includes(q) || v.id.startsWith(focused.value))
    .slice(0, 25)
    .map((v) => ({
      name: `${v.closed ? "🔒 " : ""}${v.title.slice(0, 60)} (${v.id.slice(0, 8)})`,
      value: v.id,
    }));
  await interaction.respond(filtered);
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
  if (sub === "new") return handleNew(interaction);
  if (sub === "close") return handleClose(interaction);
  if (sub === "info") return handleInfo(interaction);
  if (sub === "book") return handleBook(interaction);
  await interaction.reply({
    content: `Unknown subcommand: ${sub}`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * /vote new の handler.
 *
 * Slash option (title / closes_at / mention / remind_hours_before) を draft に保存して、
 * 候補入力 modal を表示する。modal 提出後の処理は vote-modal-submit.ts に委譲。
 */
async function handleNew(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const channel = interaction.channel;
  if (!channel || !("send" in channel) || typeof channel.send !== "function") {
    await interaction.reply({
      content: "このチャネルでは投稿できません。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const title = interaction.options.getString("title", true);

  // closes_at 検証
  const closesAtInput = interaction.options.getString("closes_at");
  let closesAt: number | null = null;
  if (closesAtInput) {
    const parsed = parseJstDateTime(closesAtInput);
    if (parsed === null) {
      await interaction.reply({
        content: `締切の日時形式が不正です: \`${closesAtInput}\`\n例: \`2026-06-01 21:00\``,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (parsed <= Date.now()) {
      await interaction.reply({
        content: `締切は未来の日時を指定してください: ${formatDiscordTime(parsed)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    closesAt = parsed;
  }

  // mention auto-detect (固定 channel なら role 補完)
  const parentId = "parentId" in channel ? channel.parentId : null;
  const owningStatic = findStaticForChannel(guildId, channel.id, parentId);
  let mention = interaction.options.getString("mention");
  if (!mention && owningStatic) {
    mention = `<@&${owningStatic.roleId}>`;
  }

  // reminder 検証
  const reminderHoursBefore = interaction.options.getInteger("remind_hours_before");
  if (reminderHoursBefore !== null && closesAt === null) {
    await interaction.reply({
      content: "リマインダーを設定するには `closes_at` も必要です。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (reminderHoursBefore !== null && closesAt !== null) {
    const reminderAt = closesAt - reminderHoursBefore * 3_600_000;
    if (reminderAt <= Date.now()) {
      await interaction.reply({
        content: `リマインダー時刻が既に過去です (${reminderHoursBefore}h before ${formatDiscordTime(closesAt)}).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  // Draft を保存して modal を表示
  const draftId = randomUUID();
  putDraft(draftId, {
    guildId,
    channelId: channel.id,
    creatorId: interaction.user.id,
    title,
    closesAt,
    mention,
    reminderHoursBefore,
    staticId: owningStatic?.id ?? null,
    createdAt: Date.now(),
  });

  const modal = new ModalBuilder()
    .setCustomId(`vote-modal:${draftId}`)
    .setTitle(`投票: ${title.slice(0, 38)}`);

  const candidatesInput = new TextInputBuilder()
    .setCustomId("candidates")
    .setLabel("候補 (1 行に 1 件、2〜5 件)")
    .setPlaceholder("2026-06-01 21:00\n2026-06-02 21:00\n2026-06-03 21:00")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(400);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(candidatesInput)
  );

  await interaction.showModal(modal);
}

async function handleClose(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getString("id", true);
  const vote = getVote(id);
  if (!vote || vote.guildId !== interaction.guildId) {
    await interaction.reply({
      content: `投票が見つかりません: \`${id}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (vote.closed) {
    await interaction.reply({
      content: "この投票は既に締切済みです。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (vote.creatorId !== interaction.user.id) {
    await interaction.reply({
      content: "この投票を締め切れるのは作成者のみです。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  closeVote(id);
  // Re-render with closed=true (fetched fresh)
  const updated = getVote(id);
  if (updated && updated.messageId) {
    try {
      const ch = await interaction.client.channels.fetch(updated.channelId);
      if (ch && "messages" in ch) {
        const msg = await ch.messages.fetch(updated.messageId);
        const { embeds, components } = renderVoteMessage(updated, getResponses(id));
        await msg.edit({ embeds, components });
      }
    } catch (err) {
      console.error("Failed to update vote message on close:", err);
    }
  }
  await interaction.reply({
    content: `🔒 締切しました: ${vote.title}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getString("id", true);
  const vote = getVote(id);
  if (!vote || vote.guildId !== interaction.guildId) {
    await interaction.reply({
      content: `投票が見つかりません: \`${id}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const responses = getResponses(id);
  const { embeds } = renderVoteMessage(vote, responses);
  const candidates = getCandidates(vote);
  await interaction.reply({
    content: `候補数: ${candidates.length} / 回答数: ${responses.length}`,
    embeds,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleBook(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getString("id", true);
  const rank = interaction.options.getInteger("rank") ?? 1;
  const notifyMinutesBefore = interaction.options.getInteger("notify_minutes_before") ?? 10;

  const vote = getVote(id);
  if (!vote || vote.guildId !== interaction.guildId) {
    await interaction.reply({
      content: `投票が見つかりません: \`${id}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const responses = getResponses(id);
  const cand = pickRankedCandidate(vote, responses, rank);
  if (!cand) {
    await interaction.reply({
      content: `${rank} 番目の候補が存在しません。候補数を確認してください。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!cand.startsAt) {
    await interaction.reply({
      content: `候補「${cand.label}」は日時として parse できないため予定化できません。\n候補は \`YYYY-MM-DD HH:mm\` 形式で作成してください。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (cand.startsAt <= Date.now()) {
    await interaction.reply({
      content: `候補日時が既に過去です: ${formatDiscordTime(cand.startsAt)}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Insert a schedule row, channel = vote's channel.
  const scheduleId = randomUUID();
  const now = Date.now();
  getDb()
    .insert(schedules)
    .values({
      id: scheduleId,
      guildId: vote.guildId,
      channelId: vote.channelId,
      contentId: null,
      phaseId: null,
      startsAt: cand.startsAt,
      notifyMinutesBefore,
      mention: vote.mention,
      note: `投票結果: ${vote.title} (rank ${rank})`,
      chouseisanUrl: null,
      staticId: vote.staticId,
      createdAt: now,
      createdBy: interaction.user.id,
    })
    .run();

  const notifyAt = cand.startsAt - notifyMinutesBefore * 60_000;
  const yesUsers = responses.filter((r) => r.candidateIndex === cand.index && r.value === "yes");
  const embed = new EmbedBuilder()
    .setTitle("📅 投票結果を予定として登録しました")
    .setColor(0x6e85b7)
    .addFields(
      { name: "投票", value: vote.title, inline: false },
      { name: "選ばれた候補", value: `**${cand.index + 1}. ${cand.label}** (rank ${rank}, ⭕${yesUsers.length})`, inline: false },
      { name: "開始", value: `${formatDiscordTime(cand.startsAt)} (${formatDiscordTime(cand.startsAt, "R")})`, inline: false },
      { name: "通知先", value: `<#${vote.channelId}>`, inline: true },
      { name: "通知時刻", value: `${formatDiscordTime(notifyAt)} (${notifyMinutesBefore}分前)`, inline: true }
    );
  if (vote.mention) embed.addFields({ name: "メンション", value: vote.mention, inline: false });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
