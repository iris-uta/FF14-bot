import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import {
  createVote,
  setVoteMessageId,
  getVote,
  getResponses,
  closeVote,
  listOpenVotesInGuild,
  parseCandidateInput,
  renderVoteMessage,
  getCandidates,
} from "../services/vote";
import { parseJstDateTime, formatDiscordTime } from "../services/datetime";
import { findStaticForChannel } from "../services/static-manager";

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
      .setDescription("新しい投票を作成 (候補 2〜5 件)")
      .setDescriptionLocalizations({ ja: "新しい投票を作成 (候補 2〜5 件)" })
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
          .setName("candidate1")
          .setNameLocalizations({ ja: "候補1" })
          .setDescription("候補1 (日時なら YYYY-MM-DD HH:mm、自由文も可)")
          .setDescriptionLocalizations({ ja: "候補1 (日時なら YYYY-MM-DD HH:mm、自由文も可)" })
          .setRequired(true)
          .setMaxLength(80)
      )
      .addStringOption((opt) =>
        opt
          .setName("candidate2")
          .setNameLocalizations({ ja: "候補2" })
          .setDescription("候補2")
          .setDescriptionLocalizations({ ja: "候補2" })
          .setRequired(true)
          .setMaxLength(80)
      )
      .addStringOption((opt) =>
        opt
          .setName("candidate3")
          .setNameLocalizations({ ja: "候補3" })
          .setDescription("候補3 (任意)")
          .setDescriptionLocalizations({ ja: "候補3 (任意)" })
          .setMaxLength(80)
      )
      .addStringOption((opt) =>
        opt
          .setName("candidate4")
          .setNameLocalizations({ ja: "候補4" })
          .setDescription("候補4 (任意)")
          .setDescriptionLocalizations({ ja: "候補4 (任意)" })
          .setMaxLength(80)
      )
      .addStringOption((opt) =>
        opt
          .setName("candidate5")
          .setNameLocalizations({ ja: "候補5" })
          .setDescription("候補5 (任意)")
          .setDescriptionLocalizations({ ja: "候補5 (任意)" })
          .setMaxLength(80)
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
  const open = listOpenVotesInGuild(interaction.guildId, 25);
  const filtered = open
    .filter((v) => v.title.toLowerCase().includes(focused.value.toLowerCase()) || v.id.startsWith(focused.value))
    .slice(0, 25)
    .map((v) => ({
      name: `${v.title.slice(0, 60)} (${v.id.slice(0, 8)})`,
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
  await interaction.reply({
    content: `Unknown subcommand: ${sub}`,
    flags: MessageFlags.Ephemeral,
  });
}

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
  const rawCandidates: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const v = interaction.options.getString(`candidate${i}`);
    if (v) rawCandidates.push(v);
  }
  if (rawCandidates.length < 2) {
    await interaction.reply({
      content: "候補は 2 件以上必要です。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const candidates = rawCandidates.map((raw, idx) => parseCandidateInput(raw, idx));

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

  // Auto-detect static for optional mention default + linking
  const parentId = "parentId" in channel ? channel.parentId : null;
  const owningStatic = findStaticForChannel(guildId, channel.id, parentId);
  let mention = interaction.options.getString("mention");
  if (!mention && owningStatic) {
    mention = `<@&${owningStatic.roleId}>`;
  }

  // Defer (channel.send + edit is multi-step)
  await interaction.deferReply();

  const id = randomUUID();
  const vote = createVote({
    id,
    guildId,
    channelId: channel.id,
    creatorId: interaction.user.id,
    title,
    candidates,
    closesAt,
    staticId: owningStatic?.id ?? null,
  });

  const { embeds, components } = renderVoteMessage(vote, []);
  const content = mention ?? undefined;
  const sent = await channel.send({ content, embeds, components, allowedMentions: { parse: ["everyone", "roles"] } });
  setVoteMessageId(id, sent.id);

  await interaction.editReply({
    content: `🗳️ 投票を作成しました。 ID: \`${id.slice(0, 8)}\``,
  });
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
