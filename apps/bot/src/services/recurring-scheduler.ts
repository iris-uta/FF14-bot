/**
 * Recurring scheduler — 定期予定 (例: 毎週金曜 21:00 JST) を自動 schedule 化する worker.
 *
 * tick (1h おき):
 *  各 active rule について:
 *   - 次の occurrence (now 以降で最初に来る weekday + hh:mm JST) を計算
 *   - 既に同じ rule で同じ occurrence を挿入済み (lastInsertedAt が一致) ならスキップ
 *   - その時刻 ±1h に既存 schedule (任意の出所) があればスキップ (重複防止)
 *   - schedules に insert + rule.lastInsertedAt 更新
 *
 * 既存 alert-worker が startsAt - notifyMinutesBefore で通知する。
 */
import { randomUUID } from "node:crypto";
import { and, asc, between, eq, sql } from "drizzle-orm";
import {
  recurringSchedules,
  schedules,
  type RecurringSchedule,
  type NewRecurringSchedule,
} from "@ff14kotei/db";
import { getDb } from "../lib/db";
import { makeSafeTick, type SafeTickRunner } from "../lib/safe-tick";

/** Tick once an hour. The window of "what to schedule" is ~7 days ahead. */
export const TICK_INTERVAL_MS = 60 * 60_000;
/** Look ahead this far when computing the "next occurrence" to insert. */
export const LOOKAHEAD_MS = 7 * 24 * 60 * 60_000;
/** Treat a pre-existing schedule within this window as "already scheduled" — skip. */
export const DEDUP_WINDOW_MS = 60 * 60_000;

let timer: NodeJS.Timeout | null = null;
let runner: SafeTickRunner | null = null;

export function startRecurringScheduler(): void {
  if (timer) return;
  runner = makeSafeTick("recurring-scheduler", async () => {
    await tick();
  });
  timer = setInterval(() => {
    void runner!.run();
  }, TICK_INTERVAL_MS);
  void runner.run();
}

export function stopRecurringScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function waitForRecurringScheduler(): Promise<void> {
  return runner?.waitForCurrentTick() ?? Promise.resolve();
}

/**
 * Run one scheduling pass: scan all active rules, insert any due occurrence.
 * Returns count of newly inserted schedules.
 */
export async function tick(now: number = Date.now()): Promise<number> {
  const rules = listActiveRules();
  let inserted = 0;
  for (const rule of rules) {
    try {
      const result = scheduleNextOccurrence(rule, now);
      if (result) inserted++;
    } catch (err) {
      console.error(`recurring-scheduler: failed for rule ${rule.id}:`, err);
    }
  }
  return inserted;
}

/**
 * Compute next occurrence of (weekday, hourJst, minuteJst) at or after `now`.
 * Returns Unix milliseconds (UTC) of that occurrence.
 *
 * Algorithm:
 *  1. Convert `now` to JST
 *  2. Find the next day where weekday matches AND time is >= hh:mm (if today)
 *  3. Convert back to UTC
 */
export function computeNextOccurrence(
  weekday: number,    // 0=Sun ... 6=Sat (JST)
  hourJst: number,
  minuteJst: number,
  now: number = Date.now()
): number {
  // JST is UTC+9 with no DST.
  const JST_OFFSET_MS = 9 * 60 * 60_000;
  const nowJst = new Date(now + JST_OFFSET_MS);
  const nowJstDay = nowJst.getUTCDay(); // sunday=0
  const nowJstHour = nowJst.getUTCHours();
  const nowJstMin = nowJst.getUTCMinutes();

  // Days to add to reach target weekday (0 if today)
  let daysAhead = (weekday - nowJstDay + 7) % 7;

  // If today but time has already passed, push to next week
  if (daysAhead === 0) {
    const currentMinutes = nowJstHour * 60 + nowJstMin;
    const targetMinutes = hourJst * 60 + minuteJst;
    if (currentMinutes >= targetMinutes) {
      daysAhead = 7;
    }
  }

  // Compose target date in JST
  const targetJstMs = Date.UTC(
    nowJst.getUTCFullYear(),
    nowJst.getUTCMonth(),
    nowJst.getUTCDate() + daysAhead,
    hourJst,
    minuteJst,
    0,
    0
  );
  // Subtract the JST offset to get UTC
  return targetJstMs - JST_OFFSET_MS;
}

/**
 * Insert a schedule for this rule's next occurrence if not already scheduled.
 * Returns the inserted schedule id, or null if skipped (duplicate / already done).
 */
export function scheduleNextOccurrence(rule: RecurringSchedule, now: number = Date.now()): string | null {
  const occurrence = computeNextOccurrence(rule.weekday, rule.hourJst, rule.minuteJst, now);
  if (occurrence - now > LOOKAHEAD_MS) return null;

  // Skip if this exact occurrence was already inserted by this rule
  if (rule.lastInsertedAt && Math.abs(rule.lastInsertedAt - occurrence) < 60_000) {
    return null;
  }

  // Skip if any existing schedule (regardless of source) is within DEDUP_WINDOW_MS
  // of the target occurrence in the same channel — prevents double-booking
  // when user manually /book'd this same slot.
  const db = getDb();
  const dupCheck = db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.channelId, rule.channelId),
        between(
          schedules.startsAt,
          occurrence - DEDUP_WINDOW_MS,
          occurrence + DEDUP_WINDOW_MS
        )
      )
    )
    .get();
  if (dupCheck) return null;

  const id = randomUUID();
  db.insert(schedules)
    .values({
      id,
      guildId: rule.guildId,
      channelId: rule.channelId,
      contentId: rule.contentId,
      phaseId: rule.phaseId,
      startsAt: occurrence,
      notifyMinutesBefore: rule.notifyMinutesBefore,
      mention: rule.mention,
      note: rule.note ? `[定期] ${rule.note}` : "[定期予定]",
      chouseisanUrl: null,
      staticId: rule.staticId,
      createdAt: now,
      createdBy: rule.createdBy,
    })
    .run();

  db.update(recurringSchedules)
    .set({ lastInsertedAt: occurrence })
    .where(eq(recurringSchedules.id, rule.id))
    .run();

  return id;
}

/* ── CRUD helpers (used by /recurring command) ─────────────────────── */

export function listActiveRules(): RecurringSchedule[] {
  const db = getDb();
  return db
    .select()
    .from(recurringSchedules)
    .where(eq(recurringSchedules.active, true))
    .orderBy(asc(recurringSchedules.createdAt))
    .all();
}

export function listRulesInGuild(guildId: string): RecurringSchedule[] {
  const db = getDb();
  return db
    .select()
    .from(recurringSchedules)
    .where(eq(recurringSchedules.guildId, guildId))
    .orderBy(asc(recurringSchedules.createdAt))
    .all();
}

export function getRule(id: string): RecurringSchedule | null {
  const db = getDb();
  return db.select().from(recurringSchedules).where(eq(recurringSchedules.id, id)).get() ?? null;
}

export function createRule(input: NewRecurringSchedule): RecurringSchedule {
  const db = getDb();
  db.insert(recurringSchedules).values(input).run();
  const row = db
    .select()
    .from(recurringSchedules)
    .where(eq(recurringSchedules.id, input.id))
    .get();
  if (!row) throw new Error(`recurring insert failed: ${input.id}`);
  return row;
}

export function deleteRule(id: string): void {
  const db = getDb();
  db.delete(recurringSchedules).where(eq(recurringSchedules.id, id)).run();
}

/* ── Display helpers ───────────────────────────────────────────────── */

export const WEEKDAY_LABELS: Record<number, string> = {
  0: "日", 1: "月", 2: "火", 3: "水", 4: "木", 5: "金", 6: "土",
};

/**
 * "毎週金曜 21:00 JST"
 */
export function formatRuleSchedule(rule: RecurringSchedule): string {
  const wd = WEEKDAY_LABELS[rule.weekday] ?? "?";
  const time = `${String(rule.hourJst).padStart(2, "0")}:${String(rule.minuteJst).padStart(2, "0")}`;
  return `毎週${wd}曜 ${time} JST`;
}

/**
 * Count active rules — used by command shape validation and stats.
 */
export function countRulesInGuild(guildId: string): number {
  const db = getDb();
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(recurringSchedules)
    .where(eq(recurringSchedules.guildId, guildId))
    .get();
  return row?.count ?? 0;
}
