/**
 * Vote auto-closer worker.
 * 30秒ごとに closes_at <= now の open vote を探して
 *  - DB の closed を true に
 *  - 元メッセージを edit (ボタン disable + footer 更新)
 *  - 作成者に DM で結果サマリーを送信 (失敗しても継続)
 */
import { and, eq, isNotNull, lte } from "drizzle-orm";
import type { Client } from "discord.js";
import { votes, type Vote } from "@ff14kotei/db";
import { getDb } from "../lib/db";
import {
  closeVote,
  getCandidates,
  getResponses,
  renderVoteMessage,
  tallyCandidate,
} from "./vote";

export const TICK_INTERVAL_MS = 30_000;

let timer: NodeJS.Timeout | null = null;

export function startVoteCloserWorker(client: Client): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick(client);
  }, TICK_INTERVAL_MS);
  // Run once immediately so startup catches anything that expired while bot was offline
  void tick(client);
}

export function stopVoteCloserWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function tick(client: Client, now: number = Date.now()): Promise<void> {
  const due = findDueVotes(now);
  for (const vote of due) {
    try {
      await autoCloseVote(client, vote);
    } catch (err) {
      console.error(`vote-closer: failed to close vote ${vote.id}:`, err);
    }
  }
}

/**
 * Find votes where closesAt is set, in the past, and not yet closed.
 */
export function findDueVotes(now: number): Vote[] {
  const db = getDb();
  return db
    .select()
    .from(votes)
    .where(
      and(
        eq(votes.closed, false),
        isNotNull(votes.closesAt),
        lte(votes.closesAt, now)
      )
    )
    .all();
}

export async function autoCloseVote(client: Client, vote: Vote): Promise<void> {
  // 1. Mark closed in DB.
  closeVote(vote.id);

  // 2. Edit the original message (best-effort).
  const updated = { ...vote, closed: true };
  if (vote.messageId) {
    try {
      const ch = await client.channels.fetch(vote.channelId);
      if (ch && "messages" in ch) {
        const msg = await ch.messages.fetch(vote.messageId);
        const { embeds, components } = renderVoteMessage(updated, getResponses(vote.id));
        await msg.edit({ embeds, components });
      }
    } catch (err) {
      console.error(`vote-closer: could not edit message for ${vote.id}:`, err);
    }
  }

  // 3. DM the creator with the result summary (best-effort).
  try {
    const user = await client.users.fetch(vote.creatorId);
    await user.send(buildResultDm(updated));
  } catch (err) {
    // Many users have DMs from non-friends disabled — log silently.
    console.warn(`vote-closer: could not DM creator ${vote.creatorId} for ${vote.id}:`, err);
  }
}

/**
 * Build a plain-text summary for DMing the creator.
 * Lists each candidate with counts, sorted by yes-count desc so the winner is on top.
 */
export function buildResultDm(vote: Vote): string {
  const candidates = getCandidates(vote);
  const responses = getResponses(vote.id);
  const lines: string[] = [];
  lines.push(`🔒 **${vote.title}** の投票が締切されました`);
  lines.push("");

  const ranked = candidates
    .map((c) => {
      const t = tallyCandidate(responses, c.index);
      return { cand: c, tally: t };
    })
    .sort((a, b) => b.tally.counts.yes - a.tally.counts.yes);

  for (let i = 0; i < ranked.length; i++) {
    const { cand, tally } = ranked[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "▸";
    lines.push(`${medal} **${cand.index + 1}. ${cand.label}**`);
    lines.push(`   ⭕ ${tally.counts.yes}  ❌ ${tally.counts.no}  🤔 ${tally.counts.maybe}`);
    if (tally.users.yes.length > 0) {
      const shown = tally.users.yes.slice(0, 15).map((u) => `<@${u}>`).join(" ");
      const overflow = tally.users.yes.length > 15 ? ` +${tally.users.yes.length - 15}` : "";
      lines.push(`   ⭕ ${shown}${overflow}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
