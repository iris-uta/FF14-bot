import { sql, isNull, gte, eq } from "drizzle-orm";
import { statics, staticMembers, schedules, votes, recurringSchedules } from "@ff14kotei/db";
import { getDb } from "../lib/db";

/**
 * Read-only usage snapshot for the admin dashboard, aggregated from existing
 * tables (no new instrumentation). Cross-guild totals — this is an ops view, not
 * a per-guild drill-down. Uses the `count(*)` + `.get()` idiom from
 * recurring-scheduler.ts.
 */
export interface AdminMetrics {
  guildCount: number;
  staticsTotal: number;
  /** contentId → number of statics created for it (zero-count contents are absent). */
  staticsByContent: Map<string, number>;
  activeMembers: number;
  upcomingSchedules: number;
  openVotes: number;
  activeRecurring: number;
}

function count(query: { get: () => { c: number } | undefined }): number {
  return query.get()?.c ?? 0;
}

/** `guildCount` is read from the live discord.js cache by the caller (not in the DB). */
export function collectMetrics(guildCount: number): AdminMetrics {
  const db = getDb();
  const C = sql<number>`count(*)`;

  const byContent = db
    .select({ contentId: statics.contentId, c: C })
    .from(statics)
    .groupBy(statics.contentId)
    .all();

  return {
    guildCount,
    staticsTotal: count(db.select({ c: C }).from(statics)),
    staticsByContent: new Map(byContent.map((r) => [r.contentId, r.c])),
    activeMembers: count(
      db.select({ c: C }).from(staticMembers).where(isNull(staticMembers.leftAt))
    ),
    upcomingSchedules: count(
      db.select({ c: C }).from(schedules).where(gte(schedules.startsAt, Date.now()))
    ),
    openVotes: count(db.select({ c: C }).from(votes).where(eq(votes.closed, false))),
    activeRecurring: count(
      db.select({ c: C }).from(recurringSchedules).where(eq(recurringSchedules.active, true))
    ),
  };
}
