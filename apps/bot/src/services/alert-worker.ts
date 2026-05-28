import { eq, isNull } from "drizzle-orm";
import type { Client } from "discord.js";
import { schedules, type Schedule } from "@ff14kotei/db";
import { getDb } from "../lib/db";
import { formatDiscordTime } from "./datetime";
import { makeSafeTick, type SafeTickRunner } from "../lib/safe-tick";

export const TICK_INTERVAL_MS = 30_000;
/** Skip alerts if more than 30 minutes past start time (likely bot was offline). */
export const LATE_GRACE_MS = 30 * 60_000;

let timer: NodeJS.Timeout | null = null;
let runner: SafeTickRunner | null = null;

export function startAlertWorker(client: Client): void {
  if (timer) return;
  runner = makeSafeTick("alert-worker", () => tick(client));
  timer = setInterval(() => {
    void runner!.run();
  }, TICK_INTERVAL_MS);
  // Run once immediately so startup catches any pending alerts
  void runner.run();
}

export function stopAlertWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function waitForAlertWorker(): Promise<void> {
  return runner?.waitForCurrentTick() ?? Promise.resolve();
}

export function getAlertWorkerRunner(): SafeTickRunner | null {
  return runner;
}

export async function tick(client: Client, now: number = Date.now()): Promise<void> {
  const due = findDueSchedules(now);
  for (const schedule of due) {
    try {
      await sendAlert(client, schedule);
      markNotified(schedule.id, now);
    } catch (err) {
      console.error(`alert-worker: failed to alert schedule ${schedule.id}:`, err);
    }
  }
}

export function findDueSchedules(now: number): Schedule[] {
  const db = getDb();
  const allPending = db.select().from(schedules).where(isNull(schedules.notifiedAt)).all();
  return allPending.filter((s) => isDue(s, now));
}

export function isDue(s: Schedule, now: number): boolean {
  if (s.notifiedAt !== null) return false;
  const alertTime = s.startsAt - s.notifyMinutesBefore * 60_000;
  const isReachedAlertTime = alertTime <= now;
  const isNotTooLate = now <= s.startsAt + LATE_GRACE_MS;
  return isReachedAlertTime && isNotTooLate;
}

function markNotified(id: string, now: number): void {
  const db = getDb();
  db.update(schedules).set({ notifiedAt: now }).where(eq(schedules.id, id)).run();
}

async function sendAlert(client: Client, schedule: Schedule): Promise<void> {
  const channel = await client.channels.fetch(schedule.channelId);
  if (!channel || !channel.isTextBased() || !("send" in channel) || typeof channel.send !== "function") {
    throw new Error(`Channel ${schedule.channelId} is not a sendable text channel`);
  }
  // allowedMentions: roles + users only. NEVER @everyone/@here — schedule.mention
  // comes from /book mention: (user input). Without this, discord.js v14 silently
  // strips role mentions in the string content.
  await channel.send({
    content: buildAlertMessage(schedule),
    allowedMentions: { parse: ["roles", "users"] },
  });
}

export function buildAlertMessage(schedule: Schedule): string {
  const lines: string[] = [];
  if (schedule.mention) lines.push(schedule.mention);
  lines.push(`⏰ **${schedule.notifyMinutesBefore}分後**に固定開始`);
  lines.push(`開始: ${formatDiscordTime(schedule.startsAt)} (${formatDiscordTime(schedule.startsAt, "R")})`);
  if (schedule.contentId) {
    const contentLine = schedule.phaseId
      ? `コンテンツ: ${schedule.contentId} / ${schedule.phaseId}`
      : `コンテンツ: ${schedule.contentId}`;
    lines.push(contentLine);
  }
  if (schedule.note) lines.push(`> ${schedule.note}`);
  if (schedule.chouseisanUrl) lines.push(`📊 日程調整: ${schedule.chouseisanUrl}`);
  return lines.join("\n");
}
