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
  voteResponses,
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
  return listVisibleVotes(discordId, { onlyOpen: true, limit });
}

/**
 * All upcoming schedules across statics the user has access to.
 * Sorted by start time ascending. `withinDays` defaults to 14.
 */
export interface UpcomingScheduleRow {
  schedule: Schedule;
  staticName: string | null;
  staticId: string | null;
}

export function listUpcomingForUser(
  discordId: string,
  withinDays = 14,
  now: number = Date.now()
): UpcomingScheduleRow[] {
  const db = getDb();
  const myStatics = listMyStatics(discordId);
  if (myStatics.length === 0) return [];
  const staticIds = myStatics.map((s) => s.id);
  const staticById = new Map(myStatics.map((s) => [s.id, s]));

  const horizon = now + withinDays * 24 * 60 * 60_000;
  const rows = db
    .select()
    .from(schedules)
    .where(
      and(
        gte(schedules.startsAt, now),
        sql`${schedules.startsAt} <= ${horizon}`,
        sql`${schedules.staticId} IN ${staticIds}`
      )
    )
    .orderBy(asc(schedules.startsAt))
    .limit(50)
    .all();

  return rows.map((s) => {
    const ownerStatic = s.staticId ? staticById.get(s.staticId) : null;
    return {
      schedule: s,
      staticName: ownerStatic?.name ?? null,
      staticId: ownerStatic?.id ?? null,
    };
  });
}

/**
 * Visible votes (both open + closed) with options for filtering.
 */
export function listVisibleVotes(
  discordId: string,
  opts: { onlyOpen?: boolean; limit?: number } = {}
): Vote[] {
  const db = getDb();
  const allGuilds = visibleGuildIds(discordId);
  if (allGuilds.length === 0) return [];

  const closedClause = opts.onlyOpen ? sql` AND ${votes.closed} = 0` : sql``;

  return db
    .select()
    .from(votes)
    .where(
      sql`${votes.guildId} IN ${allGuilds}${closedClause}`
    )
    .orderBy(sql`${votes.createdAt} DESC`)
    .limit(opts.limit ?? 25)
    .all();
}

/**
 * The set of guilds whose data the user can see.
 * = leader-of-any-static OR active-member-of-any-static
 */
function visibleGuildIds(discordId: string): string[] {
  const db = getDb();
  const leaderGuilds = db
    .selectDistinct({ guildId: statics.guildId })
    .from(statics)
    .where(eq(statics.leaderId, discordId))
    .all()
    .map((r) => r.guildId);

  const memberGuilds = db
    .selectDistinct({ guildId: statics.guildId })
    .from(statics)
    .innerJoin(staticMembers, eq(staticMembers.staticId, statics.id))
    .where(and(eq(staticMembers.userId, discordId), isNull(staticMembers.leftAt)))
    .all()
    .map((r) => r.guildId);

  return Array.from(new Set([...leaderGuilds, ...memberGuilds]));
}

/**
 * Fetch a vote + its responses, scoped to the user's visible guilds.
 * Returns null if the user has no access to this vote.
 */
export interface VoteDetail {
  vote: Vote;
  candidates: { index: number; label: string; startsAt?: number | null }[];
  tallies: { yes: number; no: number; maybe: number }[]; // index aligns with candidates
}

export function getVisibleVoteDetail(voteId: string, discordId: string): VoteDetail | null {
  const db = getDb();
  const v = db.select().from(votes).where(eq(votes.id, voteId)).get();
  if (!v) return null;
  const allGuilds = visibleGuildIds(discordId);
  if (!allGuilds.includes(v.guildId)) return null;

  let candidates: { index: number; label: string; startsAt?: number | null }[];
  try {
    candidates = JSON.parse(v.candidates);
  } catch {
    candidates = [];
  }

  const responses = db
    .select()
    .from(voteResponses)
    .where(eq(voteResponses.voteId, voteId))
    .all();

  const tallies = candidates.map((c) => {
    const matching = responses.filter((r) => r.candidateIndex === c.index);
    return {
      yes: matching.filter((r) => r.value === "yes").length,
      no: matching.filter((r) => r.value === "no").length,
      maybe: matching.filter((r) => r.value === "maybe").length,
    };
  });

  return { vote: v, candidates, tallies };
}
