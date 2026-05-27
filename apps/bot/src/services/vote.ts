/**
 * Vote service — 調整さん代替の self-hosted 日程投票。
 *
 * 各 vote は 1〜5 candidates を持ち、各 candidate に対して各ユーザーが
 * ⭕ (yes) / ❌ (no) / 🤔 (maybe) のいずれかを記録する。
 *
 * 票が入るたびに embed を編集して live tally を更新する。
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { and, eq, sql } from "drizzle-orm";
import { votes, voteResponses, type Vote, type VoteResponse } from "@ff14kotei/db";
import { getDb } from "../lib/db";
import { parseJstDateTime, formatDiscordTime } from "./datetime";

export type VoteValue = "yes" | "no" | "maybe";

const VALUE_EMOJI: Record<VoteValue, string> = {
  yes: "⭕",
  no: "❌",
  maybe: "🤔",
};

const VALUE_LABEL: Record<VoteValue, string> = {
  yes: "参加",
  no: "不可",
  maybe: "未定",
};

export interface VoteCandidate {
  index: number;            // 0-based
  label: string;             // 人間が読む表示 (例: "2026/05/30 (土) 22:00 JST")
  startsAt?: number | null;  // Unix ms — 日時として parse できた場合
}

/**
 * Parse 1 つの候補入力 → VoteCandidate.
 * - 日時 (YYYY-MM-DD HH:mm 等) なら parse して startsAt を埋める
 * - 任意文字列も許可 (例: "金曜の夜")
 */
export function parseCandidateInput(input: string, index: number): VoteCandidate {
  const trimmed = input.trim();
  const startsAt = parseJstDateTime(trimmed);
  if (startsAt !== null) {
    return {
      index,
      label: formatJstReadable(startsAt),
      startsAt,
    };
  }
  return { index, label: trimmed, startsAt: null };
}

/**
 * "2026/05/30 (土) 22:00 JST" のような人間が読みやすい表記。
 */
export function formatJstReadable(unixMs: number): string {
  const date = new Date(unixMs);
  // Asia/Tokyo に変換
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // "2026/05/30(土) 22:00" 等
  return fmt.format(date) + " JST";
}

export interface CreateVoteInput {
  id: string;
  guildId: string;
  channelId: string;
  creatorId: string;
  title: string;
  candidates: VoteCandidate[];
  closesAt?: number | null;
  staticId?: string | null;
}

export function createVote(input: CreateVoteInput): Vote {
  const db = getDb();
  const now = Date.now();
  db.insert(votes)
    .values({
      id: input.id,
      guildId: input.guildId,
      channelId: input.channelId,
      messageId: null,
      creatorId: input.creatorId,
      title: input.title,
      candidates: JSON.stringify(input.candidates),
      closesAt: input.closesAt ?? null,
      closed: false,
      staticId: input.staticId ?? null,
      createdAt: now,
    })
    .run();
  const row = db.select().from(votes).where(eq(votes.id, input.id)).get();
  if (!row) throw new Error(`vote insert failed: ${input.id}`);
  return row;
}

export function setVoteMessageId(voteId: string, messageId: string): void {
  const db = getDb();
  db.update(votes).set({ messageId }).where(eq(votes.id, voteId)).run();
}

export function getVote(voteId: string): Vote | null {
  const db = getDb();
  return db.select().from(votes).where(eq(votes.id, voteId)).get() ?? null;
}

export function listOpenVotesInGuild(guildId: string, limit = 25): Vote[] {
  const db = getDb();
  return db
    .select()
    .from(votes)
    .where(and(eq(votes.guildId, guildId), eq(votes.closed, false)))
    .orderBy(sql`${votes.createdAt} DESC`)
    .limit(limit)
    .all();
}

export function getResponses(voteId: string): VoteResponse[] {
  const db = getDb();
  return db.select().from(voteResponses).where(eq(voteResponses.voteId, voteId)).all();
}

export function getCandidates(vote: Vote): VoteCandidate[] {
  try {
    const parsed = JSON.parse(vote.candidates) as VoteCandidate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Upsert a response. Returns the resulting value (after upsert).
 */
export function recordResponse(
  voteId: string,
  userId: string,
  candidateIndex: number,
  value: VoteValue
): void {
  const db = getDb();
  const now = Date.now();
  db.insert(voteResponses)
    .values({
      voteId,
      userId,
      candidateIndex,
      value,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [voteResponses.voteId, voteResponses.userId, voteResponses.candidateIndex],
      set: { value, updatedAt: now },
    })
    .run();
}

export function closeVote(voteId: string): void {
  const db = getDb();
  db.update(votes).set({ closed: true }).where(eq(votes.id, voteId)).run();
}

/**
 * Render the vote message (embed + buttons).
 * - embed: title + 各候補の live tally + ⭕投票者の mention 一覧 (最大10名)
 * - buttons: 候補ごとに 1 row × 3 buttons (⭕❌🤔)。closed なら disabled。
 */
export function renderVoteMessage(
  vote: Vote,
  responses: VoteResponse[]
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const candidates = getCandidates(vote);

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${vote.title}`)
    .setColor(vote.closed ? 0x8a8a8a : 0x6e85b7)
    .setFooter({
      text: vote.closed ? "🔒 締切済み" : `vote id: ${vote.id.slice(0, 8)} · /vote close で締切`,
    });

  const headerParts: string[] = [`<@${vote.creatorId}> が作成`];
  if (vote.closesAt) {
    headerParts.push(`締切: ${formatDiscordTime(vote.closesAt)} (${formatDiscordTime(vote.closesAt, "R")})`);
  }
  embed.setDescription(headerParts.join(" · "));

  for (const cand of candidates) {
    const tallies = tallyCandidate(responses, cand.index);
    const yesUsers = tallies.users.yes;
    const maybeUsers = tallies.users.maybe;

    const lines: string[] = [];
    lines.push(
      `${VALUE_EMOJI.yes} **${tallies.counts.yes}**` +
        `   ${VALUE_EMOJI.no} ${tallies.counts.no}` +
        `   ${VALUE_EMOJI.maybe} ${tallies.counts.maybe}`
    );
    if (yesUsers.length > 0) {
      const shown = yesUsers.slice(0, 10).map((u) => `<@${u}>`).join(" ");
      const overflow = yesUsers.length > 10 ? ` +${yesUsers.length - 10}` : "";
      lines.push(`${VALUE_EMOJI.yes} ${shown}${overflow}`);
    }
    if (maybeUsers.length > 0) {
      const shown = maybeUsers.slice(0, 10).map((u) => `<@${u}>`).join(" ");
      const overflow = maybeUsers.length > 10 ? ` +${maybeUsers.length - 10}` : "";
      lines.push(`${VALUE_EMOJI.maybe} ${shown}${overflow}`);
    }

    embed.addFields({
      name: `${cand.index + 1}. ${cand.label}`,
      value: lines.join("\n"),
      inline: false,
    });
  }

  // Build buttons — 1 row per candidate (max 5 rows = 5 candidates).
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const cand of candidates.slice(0, 5)) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      buildVoteButton(vote.id, cand.index, "yes", vote.closed),
      buildVoteButton(vote.id, cand.index, "no", vote.closed),
      buildVoteButton(vote.id, cand.index, "maybe", vote.closed)
    );
    rows.push(row);
  }

  return { embeds: [embed], components: rows };
}

function buildVoteButton(
  voteId: string,
  candidateIndex: number,
  value: VoteValue,
  disabled: boolean
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`vote:${voteId}:${candidateIndex}:${value}`)
    .setLabel(`${candidateIndex + 1} ${VALUE_LABEL[value]}`)
    .setEmoji(VALUE_EMOJI[value])
    .setStyle(
      value === "yes" ? ButtonStyle.Success : value === "no" ? ButtonStyle.Danger : ButtonStyle.Secondary
    )
    .setDisabled(disabled);
}

interface CandidateTally {
  counts: Record<VoteValue, number>;
  users: Record<VoteValue, string[]>;
}

export function tallyCandidate(responses: VoteResponse[], candidateIndex: number): CandidateTally {
  const counts: Record<VoteValue, number> = { yes: 0, no: 0, maybe: 0 };
  const users: Record<VoteValue, string[]> = { yes: [], no: [], maybe: [] };
  for (const r of responses) {
    if (r.candidateIndex !== candidateIndex) continue;
    if (r.value === "yes" || r.value === "no" || r.value === "maybe") {
      counts[r.value]++;
      users[r.value].push(r.userId);
    }
  }
  return { counts, users };
}

/**
 * Custom ID parser for vote buttons.
 * Format: `vote:${voteId}:${candidateIndex}:${value}`
 */
export interface ParsedVoteButton {
  voteId: string;
  candidateIndex: number;
  value: VoteValue;
}

export function parseVoteButtonCustomId(customId: string): ParsedVoteButton | null {
  if (!customId.startsWith("vote:")) return null;
  const parts = customId.split(":");
  if (parts.length !== 4) return null;
  const [, voteId, idxStr, value] = parts;
  const candidateIndex = Number.parseInt(idxStr, 10);
  if (!voteId || Number.isNaN(candidateIndex)) return null;
  if (value !== "yes" && value !== "no" && value !== "maybe") return null;
  return { voteId, candidateIndex, value };
}
