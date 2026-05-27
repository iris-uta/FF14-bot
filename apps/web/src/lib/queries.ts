/**
 * Web-app DB queries. All take the user's Discord ID and scope results to
 * statics where the user is leader or current member.
 *
 * These are server-only (called from RSC / route handlers).
 */
import "server-only";
import { and, asc, eq, gte, isNull, or, sql } from "drizzle-orm";
import {
  statics,
  staticSlots,
  staticMembers,
  schedules,
  progressLogs,
  votes,
  type Static,
  type StaticSlot,
  type StaticMember,
  type Schedule,
  type ProgressLog,
  type Vote,
} from "@ff14kotei/db";
import { getDb } from "./db";

/**
 * Statics this user has access to:
 *   - leader of the static, OR
 *   - currently a member (left_at IS NULL)
 *
 * Sorted by most recent createdAt.
 */
export function listMyStatics(discordId: string): Static[] {
  const db = getDb();
  // Membership IDs first (sub-query approach in raw SQL would be cleaner,
  // but drizzle's `inArray` + sub-select works fine for our scale)
  const memberStaticIds = db
    .select({ id: staticMembers.staticId })
    .from(staticMembers)
    .where(and(eq(staticMembers.userId, discordId), isNull(staticMembers.leftAt)))
    .all()
    .map((r) => r.id);

  const rows = db
    .select()
    .from(statics)
    .where(
      or(
        eq(statics.leaderId, discordId),
        memberStaticIds.length > 0
          ? sql`${statics.id} IN ${memberStaticIds}`
          : sql`0`
      )
    )
    .orderBy(sql`${statics.createdAt} DESC`)
    .all();

  // Deduplicate (user might be both leader and member-row)
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/**
 * Full overview of one static (re-used in /static/[id]).
 * Returns null if the user has no access to this static.
 */
export interface StaticOverview {
  vstatic: Static;
  slots: StaticSlot[];
  members: StaticMember[];          // active only
  upcoming: Schedule[];              // next 5
  recentProgress: ProgressLog[];     // latest 10
}

export function getStaticOverviewForUser(
  staticId: string,
  discordId: string,
  now: number = Date.now()
): StaticOverview | null {
  const db = getDb();
  const vstatic = db.select().from(statics).where(eq(statics.id, staticId)).get();
  if (!vstatic) return null;

  // Access check
  const isLeader = vstatic.leaderId === discordId;
  const memberRow = db
    .select()
    .from(staticMembers)
    .where(
      and(
        eq(staticMembers.staticId, staticId),
        eq(staticMembers.userId, discordId),
        isNull(staticMembers.leftAt)
      )
    )
    .get();
  if (!isLeader && !memberRow) return null;

  const slots = db.select().from(staticSlots).where(eq(staticSlots.staticId, staticId)).all();
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
    .limit(5)
    .all();
  const recentProgress = db
    .select()
    .from(progressLogs)
    .where(eq(progressLogs.staticId, staticId))
    .orderBy(sql`${progressLogs.loggedAt} DESC`)
    .limit(10)
    .all();

  return { vstatic, slots, members, upcoming, recentProgress };
}

/**
 * Active (not-closed) votes in any guild where the user has at least one static.
 * (Simpler than full guild-membership check via Discord API.)
 */
export function listVisibleOpenVotes(discordId: string, limit = 10): Vote[] {
  const db = getDb();
  const guildIds = db
    .selectDistinct({ guildId: statics.guildId })
    .from(statics)
    .where(eq(statics.leaderId, discordId))
    .all()
    .map((r) => r.guildId);

  // Also include guilds where user is a member (not just leader)
  const memberGuildIds = db
    .selectDistinct({ guildId: statics.guildId })
    .from(statics)
    .innerJoin(staticMembers, eq(staticMembers.staticId, statics.id))
    .where(and(eq(staticMembers.userId, discordId), isNull(staticMembers.leftAt)))
    .all()
    .map((r) => r.guildId);

  const allGuilds = Array.from(new Set([...guildIds, ...memberGuildIds]));
  if (allGuilds.length === 0) return [];

  return db
    .select()
    .from(votes)
    .where(
      and(
        eq(votes.closed, false),
        sql`${votes.guildId} IN ${allGuilds}`
      )
    )
    .orderBy(sql`${votes.createdAt} DESC`)
    .limit(limit)
    .all();
}
