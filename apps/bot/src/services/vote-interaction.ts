import { MessageFlags, type ButtonInteraction } from "discord.js";
import {
  getVote,
  getResponses,
  recordResponse,
  renderVoteMessage,
  parseVoteButtonCustomId,
  getCandidates,
  type VoteValue,
} from "./vote";

const VALUE_DISPLAY: Record<VoteValue, string> = {
  yes: "⭕ 参加",
  no: "❌ 不可",
  maybe: "🤔 未定",
};

/**
 * Handle a button click on a vote message.
 * customId: `vote:${voteId}:${candidateIndex}:${value}`
 */
export async function handleVoteButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseVoteButtonCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      content: "ボタン ID が不正です。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const vote = getVote(parsed.voteId);
  if (!vote) {
    await interaction.reply({
      content: "この投票はもう存在しません。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Defense-in-depth: prevent cross-guild voting. Discord normally scopes button
  // interactions to the source channel/guild, but if a vote message were forwarded
  // or quoted into another guild we don't want users there to be able to vote.
  if (interaction.guildId && interaction.guildId !== vote.guildId) {
    await interaction.reply({
      content: "この投票は別のサーバーに属しているため投票できません。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (vote.closed) {
    await interaction.reply({
      content: "この投票は締切済みです。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (vote.closesAt && vote.closesAt <= Date.now()) {
    await interaction.reply({
      content: "この投票は締切時刻を過ぎています。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const candidates = getCandidates(vote);
  const cand = candidates.find((c) => c.index === parsed.candidateIndex);
  if (!cand) {
    await interaction.reply({
      content: "候補が見つかりません。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Defer the update so the embed edit + ephemeral reply both succeed.
  await interaction.deferUpdate();

  recordResponse(parsed.voteId, interaction.user.id, parsed.candidateIndex, parsed.value);

  // Re-render and edit the original message.
  const responses = getResponses(parsed.voteId);
  const { embeds, components } = renderVoteMessage(vote, responses);
  await interaction.editReply({ embeds, components });

  await interaction.followUp({
    content: `${VALUE_DISPLAY[parsed.value]} ← **${cand.index + 1}. ${cand.label}** に投票しました。`,
    flags: MessageFlags.Ephemeral,
  });
}
