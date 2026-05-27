/**
 * Vote reminder worker.
 * 30秒ごとに「リマインダー時刻を過ぎている & 未送信 & まだ open」 の vote を探して
 * 元投稿に reply 形式で「投票締切まであと N 時間」 と通知する。
 */
import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Client } from "discord.js";
import { votes, type Vote } from "@ff14kotei/db";
import { getDb } from "../lib/db";
import { markReminded } from "./vote";
import { formatDiscordTime } from "./datetime";

export const TICK_INTERVAL_MS = 30_000;

let timer: NodeJS.Timeout | null = null;

export function startVoteReminderWorker(client: Client): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick(client);
  }, TICK_INTERVAL_MS);
  void tick(client);
}

export function stopVoteReminderWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function tick(client: Client, now: number = Date.now()): Promise<void> {
  const due = findDueReminders(now);
  for (const vote of due) {
    try {
      await sendReminder(client, vote);
      markReminded(vote.id, now);
    } catch (err) {
      console.error(`vote-reminder: failed for ${vote.id}:`, err);
    }
  }
}

/**
 * Find votes where:
 *  - closesAt is set
 *  - reminderHoursBefore is set
 *  - closed = false
 *  - remindedAt IS NULL
 *  - now >= (closesAt - reminderHoursBefore * 3600s)
 */
export function findDueReminders(now: number): Vote[] {
  const db = getDb();
  return db
    .select()
    .from(votes)
    .where(
      and(
        eq(votes.closed, false),
        isNotNull(votes.closesAt),
        isNotNull(votes.reminderHoursBefore),
        isNull(votes.remindedAt),
        // closesAt - reminderHoursBefore * 3600_000 <= now
        //   ⇔ closesAt <= now + reminderHoursBefore * 3600_000
        lte(votes.closesAt, sql`${now} + ${votes.reminderHoursBefore} * 3600000`)
      )
    )
    .all();
}

async function sendReminder(client: Client, vote: Vote): Promise<void> {
  if (!vote.messageId) return; // never posted, skip
  const ch = await client.channels.fetch(vote.channelId);
  if (!ch || !("messages" in ch) || !("send" in ch) || typeof ch.send !== "function") return;

  const body = buildReminderMessage(vote);
  // Reply to the original vote message so it threads in context.
  await ch.send({
    content: body,
    reply: { messageReference: vote.messageId, failIfNotExists: false },
    allowedMentions: { parse: ["everyone", "roles"] },
  });
}

export function buildReminderMessage(vote: Vote): string {
  const lines: string[] = [];
  if (vote.mention) lines.push(vote.mention);
  lines.push(`⏰ 投票締切が近づいています: **${vote.title}**`);
  if (vote.closesAt) {
    lines.push(`締切: ${formatDiscordTime(vote.closesAt)} (${formatDiscordTime(vote.closesAt, "R")})`);
  }
  lines.push("まだ投票していない方はお願いします 👆");
  return lines.join("\n");
}
