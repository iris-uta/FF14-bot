/**
 * /vote new の候補入力 modal を提出された後の処理。
 * customId: `vote-modal:${draftId}`
 *
 * draft (vote-draft.ts) から title / closes_at 等を取り出し、modal の textarea を
 * パースして候補を生成し、votes テーブルに insert + 元 channel に投稿。
 */
import {
  MessageFlags,
  type ModalSubmitInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { createVote, parseCandidateInput, renderVoteMessage, setVoteMessageId } from "./vote";
import { takeDraft } from "./vote-draft";

export const MODAL_PREFIX = "vote-modal:";

/**
 * Parse the textarea value into a list of raw candidate strings.
 * - 1 line = 1 candidate
 * - empty lines skipped
 * - whitespace trimmed
 */
export function parseCandidatesTextarea(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function handleVoteModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.customId.startsWith(MODAL_PREFIX)) return;
  const draftId = interaction.customId.slice(MODAL_PREFIX.length);
  const draft = takeDraft(draftId);
  if (!draft) {
    await interaction.reply({
      content: "投票の draft が見つかりません (15分以上経過 or 既に使用済み)。 `/vote new` から再度実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rawText = interaction.fields.getTextInputValue("candidates");
  const rawCandidates = parseCandidatesTextarea(rawText);
  if (rawCandidates.length < 2) {
    await interaction.reply({
      content: "候補は 2 件以上必要です (1 行に 1 件)。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (rawCandidates.length > 5) {
    await interaction.reply({
      content: `候補は最大 5 件までです (現在 ${rawCandidates.length} 件)。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const candidates = rawCandidates.map((raw, idx) => parseCandidateInput(raw, idx));

  // Defer (channel.send + reply は別 step)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Re-fetch channel via the client (interaction.channel may be cached but we want fresh)
  const channel = await interaction.client.channels.fetch(draft.channelId);
  if (!channel || !("send" in channel) || typeof channel.send !== "function") {
    await interaction.editReply({
      content: `元の channel に投稿できません (channelId=${draft.channelId})。`,
    });
    return;
  }

  const id = randomUUID();
  const vote = createVote({
    id,
    guildId: draft.guildId,
    channelId: draft.channelId,
    creatorId: draft.creatorId,
    title: draft.title,
    candidates,
    closesAt: draft.closesAt,
    staticId: draft.staticId,
    mention: draft.mention,
    reminderHoursBefore: draft.reminderHoursBefore,
  });

  const { embeds, components } = renderVoteMessage(vote, []);
  const content = draft.mention ?? undefined;
  const sent = await channel.send({
    content,
    embeds,
    components,
    // roles + users only — prevent @everyone abuse (mention: option is user-controlled)
    allowedMentions: { parse: ["roles", "users"] },
  });
  setVoteMessageId(id, sent.id);

  await interaction.editReply({
    content: `🗳️ 投票を作成しました。 ID: \`${id.slice(0, 8)}\` · 候補数: ${candidates.length}`,
  });
}
