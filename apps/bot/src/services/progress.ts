/**
 * Progress tracking — 固定の進行マイルストーンを log + timeline 表示。
 *
 * 用途:
 *  - 「P3 到達 → 1%安定 → 撃破 → 初見クリア」 を時系列で残す
 *  - 後で Twitter にシェアする用
 *  - 新メンバー加入時に「ここまでやってます」 を共有
 */
import { asc, eq } from "drizzle-orm";
import { EmbedBuilder } from "discord.js";
import { progressLogs, type ProgressLog } from "@ff14kotei/db";
import { getDb } from "../lib/db";
import { formatDiscordTime } from "./datetime";

export const PROGRESS_STATUSES = ["reached", "cleared", "first-clear", "note"] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

const STATUS_ICON: Record<ProgressStatus, string> = {
  reached: "📍",
  cleared: "🎯",
  "first-clear": "🏆",
  note: "📝",
};

const STATUS_LABEL: Record<ProgressStatus, string> = {
  reached: "到達",
  cleared: "撃破",
  "first-clear": "初見クリア",
  note: "メモ",
};

export function isValidProgressStatus(s: string): s is ProgressStatus {
  return (PROGRESS_STATUSES as readonly string[]).includes(s);
}

export interface CreateProgressInput {
  id: string;
  staticId: string;
  guildId: string;
  userId: string;
  phaseId: string | null;
  status: ProgressStatus;
  note: string | null;
  loggedAt: number;
}

export function createProgressLog(input: CreateProgressInput): ProgressLog {
  const db = getDb();
  const now = Date.now();
  db.insert(progressLogs)
    .values({
      id: input.id,
      staticId: input.staticId,
      guildId: input.guildId,
      userId: input.userId,
      phaseId: input.phaseId,
      status: input.status,
      note: input.note,
      loggedAt: input.loggedAt,
      createdAt: now,
    })
    .run();
  const row = db.select().from(progressLogs).where(eq(progressLogs.id, input.id)).get();
  if (!row) throw new Error(`progress insert failed: ${input.id}`);
  return row;
}

export function getProgressLog(id: string): ProgressLog | null {
  const db = getDb();
  return db.select().from(progressLogs).where(eq(progressLogs.id, id)).get() ?? null;
}

export function listProgressLogsForStatic(staticId: string, limit = 50): ProgressLog[] {
  const db = getDb();
  return db
    .select()
    .from(progressLogs)
    .where(eq(progressLogs.staticId, staticId))
    .orderBy(asc(progressLogs.loggedAt))
    .limit(limit)
    .all();
}

export function deleteProgressLog(id: string): void {
  const db = getDb();
  db.delete(progressLogs).where(eq(progressLogs.id, id)).run();
}

/**
 * Render the timeline embed for a static.
 * Sorted oldest → newest. Each entry: date + icon + label + phase + note.
 */
export function renderProgressTimeline(
  staticName: string,
  logs: ProgressLog[]
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`📈 ${staticName} — 進行記録`)
    .setColor(0x6e85b7);

  if (logs.length === 0) {
    embed.setDescription("まだ記録がありません。 `/progress mark phase:p1 status:reached` で記録を始めましょう。");
    return embed;
  }

  // Group by JST month (this is a JST-first product; UTC grouping would put
  // 6/1 06:00 JST under "May" because UTC is 5/31 21:00).
  const monthFormatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  });
  const lines: string[] = [];
  let lastMonth = "";
  for (const log of logs) {
    // ja-JP format: "2026/06" — exactly what we want
    const month = monthFormatter.format(new Date(log.loggedAt));
    if (month !== lastMonth) {
      if (lines.length > 0) lines.push("");
      lines.push(`**${month}**`);
      lastMonth = month;
    }
    lines.push(formatProgressLine(log));
  }

  // Discord field value cap is 1024; split into multiple fields if needed
  const text = lines.join("\n");
  if (text.length <= 4000) {
    embed.setDescription(text);
  } else {
    embed.setDescription(text.slice(0, 3900) + "\n... (省略)");
  }

  embed.setFooter({ text: `合計 ${logs.length} 件` });
  return embed;
}

export function formatProgressLine(log: ProgressLog): string {
  const status = isValidProgressStatus(log.status) ? log.status : "note";
  const icon = STATUS_ICON[status];
  const label = STATUS_LABEL[status];
  const date = formatDiscordTime(log.loggedAt, "D");
  const phase = log.phaseId ? `**${log.phaseId}**` : "";
  const phaseLabel = phase ? `${phase} ${label}` : label;
  const note = log.note ? ` — ${log.note}` : "";
  return `${icon} ${date} · ${phaseLabel}${note}`;
}

/**
 * Build a Twitter-friendly text summary of recent milestones.
 * For sharing externally — plain text, no Discord-specific markdown.
 */
export function buildTwitterSummary(staticName: string, logs: ProgressLog[]): string {
  const recent = logs.slice(-5);
  const lines: string[] = [];
  lines.push(`【${staticName} 進行記録】`);
  for (const log of recent) {
    const status = isValidProgressStatus(log.status) ? log.status : "note";
    const icon = STATUS_ICON[status];
    const label = STATUS_LABEL[status];
    const date = new Date(log.loggedAt).toISOString().slice(0, 10);
    const phase = log.phaseId ? `${log.phaseId} ` : "";
    const note = log.note ? ` ${log.note}` : "";
    lines.push(`${icon} ${date} ${phase}${label}${note}`);
  }
  return lines.join("\n");
}
