/**
 * /static-info: 固定の現状を 1 つの embed にまとめる。
 *
 * 表示項目:
 *  - 名前 / コンテンツ / 戦略 / リーダー
 *  - 8 slot (MT/ST/H1/H2/D1-D4) の fill 状況
 *  - 現在 phase + pause 状況
 *  - 直近 3 つの予定 (schedules table から)
 *  - active メンバー一覧 (staticMembers.leftAt is null)
 */
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { EmbedBuilder } from "discord.js";
import {
  statics,
  staticSlots,
  staticMembers,
  schedules,
  type Static,
  type StaticSlot,
  type StaticMember,
  type Schedule,
} from "@ff14kotei/db";
import type { Content } from "@ff14kotei/schema";
import { getDb } from "../lib/db";
import { getContentById } from "../lib/contents";
import { formatDiscordTime } from "./datetime";

/** Canonical slot order for display. */
export const SLOT_ORDER = ["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"] as const;
export type SlotRole = (typeof SLOT_ORDER)[number];

const SLOT_ICON: Record<SlotRole, string> = {
  MT: "🛡️", ST: "🛡️",
  H1: "💚", H2: "💚",
  D1: "⚔️", D2: "⚔️", D3: "⚔️", D4: "⚔️",
};

const STATUS_LABEL: Record<string, string> = {
  open: "🟢 募集中",
  applied: "🟡 申請中",
  confirmed: "🔵 確定",
  filled: "✅ 完了",
  closed: "⚫ クローズ",
};

export interface StaticOverview {
  vstatic: Static;
  content: Content | null;
  slots: StaticSlot[];
  members: StaticMember[];          // active のみ (leftAt is null)
  upcoming: Schedule[];              // 直近 3 件
}

/**
 * Fetch all data needed to render /static-info.
 */
export function buildStaticOverview(staticId: string, now: number = Date.now()): StaticOverview | null {
  const db = getDb();
  const vstatic = db.select().from(statics).where(eq(statics.id, staticId)).get();
  if (!vstatic) return null;

  const slots = db
    .select()
    .from(staticSlots)
    .where(eq(staticSlots.staticId, staticId))
    .all();

  const members = db
    .select()
    .from(staticMembers)
    .where(and(eq(staticMembers.staticId, staticId), isNull(staticMembers.leftAt)))
    .all();

  const upcoming = db
    .select()
    .from(schedules)
    .where(and(eq(schedules.staticId, staticId), gte(schedules.startsAt, now)))
    .orderBy(asc(schedules.startsAt))
    .limit(3)
    .all();

  const content = getContentById(vstatic.contentId) ?? null;

  return { vstatic, content, slots, members, upcoming };
}

export function renderStaticInfoEmbed(o: StaticOverview): EmbedBuilder {
  const { vstatic, content, slots, members, upcoming } = o;
  const isPaused = vstatic.pausedUntil !== null && vstatic.pausedUntil > Date.now();
  const embed = new EmbedBuilder()
    .setTitle(`${isPaused ? "⏸️ " : "🏰 "}${vstatic.name}`)
    .setColor(isPaused ? 0x8a8a8a : 0x6e85b7);

  // Header (リーダー + コンテンツ)
  const headerLines: string[] = [];
  headerLines.push(`👑 <@${vstatic.leaderId}>`);
  if (content) {
    const strategyLine = vstatic.strategyId
      ? ` (${findStrategyLabel(content, vstatic.strategyId)})`
      : "";
    headerLines.push(`📜 ${content.displayName ?? content.id}${strategyLine}`);
  } else {
    headerLines.push(`📜 ${vstatic.contentId}`);
  }
  if (vstatic.currentPhaseId) {
    headerLines.push(`🎯 進行中: **${vstatic.currentPhaseId}**`);
  }
  if (isPaused && vstatic.pausedUntil) {
    headerLines.push(`⏸️ 〜 ${formatDiscordTime(vstatic.pausedUntil, "f")} まで一時停止中`);
  }
  embed.setDescription(headerLines.join("\n"));

  // Slot grid (8 slots, 2 columns of 4)
  embed.addFields({
    name: "ロール",
    value: renderSlotGrid(slots),
    inline: false,
  });

  // Active members
  if (members.length > 0) {
    const memberLines = members.map((m) => {
      const role = m.gameRole ?? "?";
      const job = m.job ?? "?";
      return `${SLOT_ICON[role as SlotRole] ?? "▸"} <@${m.userId}> — ${role}/${job}`;
    });
    embed.addFields({
      name: `メンバー (${members.length})`,
      value: memberLines.slice(0, 10).join("\n") + (memberLines.length > 10 ? `\n+${memberLines.length - 10}` : ""),
      inline: false,
    });
  }

  // Upcoming schedules
  if (upcoming.length > 0) {
    const lines = upcoming.map((s) => {
      const tag = s.phaseId ? ` · ${s.phaseId}` : "";
      const note = s.note ? ` — ${s.note}` : "";
      return `▸ ${formatDiscordTime(s.startsAt, "f")} (${formatDiscordTime(s.startsAt, "R")})${tag}${note}`;
    });
    embed.addFields({
      name: "📅 直近の予定",
      value: lines.join("\n"),
      inline: false,
    });
  } else {
    embed.addFields({
      name: "📅 直近の予定",
      value: "なし · `/book` で予定登録",
      inline: false,
    });
  }

  embed.setFooter({
    text: `id: ${vstatic.id.slice(0, 8)} · created ${formatDateOnly(vstatic.createdAt)}`,
  });
  return embed;
}

/**
 * Render the 8-slot fill grid as 2 columns × 4 rows of plain text.
 * Missing slot rows are filled with "open" placeholders so the grid is always 8 lines.
 */
export function renderSlotGrid(slots: StaticSlot[]): string {
  const byRole: Record<string, StaticSlot | undefined> = {};
  for (const s of slots) byRole[s.role] = s;

  const lines: string[] = [];
  for (const role of SLOT_ORDER) {
    const slot = byRole[role];
    const icon = SLOT_ICON[role];
    if (!slot) {
      lines.push(`${icon} **${role}** — ${STATUS_LABEL.open}`);
      continue;
    }
    if (slot.assigneeUserId) {
      const job = slot.job ? ` ${slot.job}` : "";
      lines.push(`${icon} **${role}** — <@${slot.assigneeUserId}>${job} (${STATUS_LABEL[slot.status] ?? slot.status})`);
    } else {
      const jobs = parseJobsArray(slot.jobs);
      const jobsLabel = jobs.length > 0 ? ` [${jobs.join("/")}]` : "";
      lines.push(`${icon} **${role}** — ${STATUS_LABEL[slot.status] ?? slot.status}${jobsLabel}`);
    }
  }
  return lines.join("\n");
}

/**
 * Static.strategyId can refer to a strategy variant on any phase. Walk all phases
 * to find a matching id; return the name if found, otherwise the raw id.
 */
function findStrategyLabel(content: Content, strategyId: string): string {
  for (const phase of content.phases ?? []) {
    const match = phase.strategies?.find((s) => s.id === strategyId);
    if (match) return match.name ?? strategyId;
  }
  return strategyId;
}

function parseJobsArray(jobsJson: string | null): string[] {
  if (!jobsJson) return [];
  try {
    const parsed = JSON.parse(jobsJson);
    return Array.isArray(parsed) ? parsed.filter((j) => typeof j === "string") : [];
  } catch {
    return [];
  }
}

function formatDateOnly(unixMs: number): string {
  return new Date(unixMs).toISOString().slice(0, 10);
}

/**
 * List statics in a guild (for autocomplete).
 */
export function listStaticsInGuild(guildId: string): Static[] {
  const db = getDb();
  return db
    .select()
    .from(statics)
    .where(eq(statics.guildId, guildId))
    .orderBy(sql`${statics.createdAt} DESC`)
    .all();
}
