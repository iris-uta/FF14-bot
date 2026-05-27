import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

/**
 * Scheduled events (固定活動の予定). Used by B-5 alert worker.
 * Times are stored as Unix milliseconds (UTC) to avoid timezone issues.
 */
export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  contentId: text("content_id"),
  phaseId: text("phase_id"),
  startsAt: integer("starts_at").notNull(),
  notifyMinutesBefore: integer("notify_minutes_before").notNull().default(10),
  notifiedAt: integer("notified_at"),
  mention: text("mention"),
  note: text("note"),
  chouseisanUrl: text("chouseisan_url"),
  staticId: text("static_id"),                  // Phase A: 固定との紐付け (optional FK)
  createdAt: integer("created_at").notNull(),
  createdBy: text("created_by").notNull(),
});

export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;

/**
 * Static party (固定). Created by /static-init.
 * One static per (guildId, name) — Discord role and category are owned by it.
 */
export const statics = sqliteTable("statics", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  leaderId: text("leader_id").notNull(),
  name: text("name").notNull(),
  contentId: text("content_id").notNull(),
  strategyId: text("strategy_id"),                 // 進行スタイル (content.strategies[].id)
  roleId: text("role_id").notNull(),               // Discord role
  categoryId: text("category_id").notNull(),       // Discord category
  lobbyChannelId: text("lobby_channel_id"),
  recruitmentChannelId: text("recruitment_channel_id"),
  currentPhaseId: text("current_phase_id"),
  pausedUntil: integer("paused_until"),            // alert worker が skip する期限
  planId: text("plan_id"),                         // Phase B 計画書 FK (optional)
  createdAt: integer("created_at").notNull(),
});

export type Static = typeof statics.$inferSelect;
export type NewStatic = typeof statics.$inferInsert;

/**
 * Static slot — 8 つのロール (MT/ST/H1/H2/D1-D4) を per-static で持つ。
 * 各スロット独立にstatus (open/applied/confirmed/filled/closed) を持つ。
 */
export const staticSlots = sqliteTable(
  "static_slots",
  {
    staticId: text("static_id").notNull(),
    role: text("role").notNull(),                  // MT/ST/H1/H2/D1/D2/D3/D4
    jobs: text("jobs"),                             // JSON: ["PLD","WAR"] (募集時のみ)
    assigneeUserId: text("assignee_user_id"),       // Discord user ID (filled時)
    status: text("status").notNull(),               // open/applied/confirmed/filled/closed
    job: text("job"),                               // 確定時のジョブ (PLD等)
    filledAt: integer("filled_at"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.staticId, t.role] }),
  })
);

export type StaticSlot = typeof staticSlots.$inferSelect;
export type NewStaticSlot = typeof staticSlots.$inferInsert;

/**
 * Static member history — 過去メンバー追跡用。
 * (staticId, userId) の組み合わせがユニーク。leftAt が null なら現役メンバー。
 */
export const staticMembers = sqliteTable(
  "static_members",
  {
    staticId: text("static_id").notNull(),
    userId: text("user_id").notNull(),
    gameRole: text("game_role"),                    // MT/ST/H1/H2/D1-D4
    job: text("job"),                               // PLD/WAR/...
    joinedAt: integer("joined_at").notNull(),
    leftAt: integer("left_at"),                     // null = 現役
  },
  (t) => ({
    pk: primaryKey({ columns: [t.staticId, t.userId] }),
  })
);

export type StaticMember = typeof staticMembers.$inferSelect;
export type NewStaticMember = typeof staticMembers.$inferInsert;

/**
 * Vote (調整さん代替の self-hosted 投票).
 * 1 vote = 1 質問 with 1〜5 候補。
 * candidates は JSON: [{index, label}]。
 */
export const votes = sqliteTable("votes", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id"),                 // 投稿後にセット (re-render 用)
  creatorId: text("creator_id").notNull(),
  title: text("title").notNull(),
  candidates: text("candidates").notNull(),       // JSON: [{index:number, label:string}]
  closesAt: integer("closes_at"),                  // null = 締切なし
  closed: integer("closed", { mode: "boolean" }).notNull().default(false),
  staticId: text("static_id"),                     // 固定 channel から自動検出 (optional)
  createdAt: integer("created_at").notNull(),
});

export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;

/**
 * Vote response — 1 user × 1 candidate × 1 value。
 * PK (voteId, userId, candidateIndex) で upsert。
 * value ∈ {"yes", "no", "maybe"}
 */
export const voteResponses = sqliteTable(
  "vote_responses",
  {
    voteId: text("vote_id").notNull(),
    userId: text("user_id").notNull(),
    candidateIndex: integer("candidate_index").notNull(),
    value: text("value").notNull(),                // yes/no/maybe
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.voteId, t.userId, t.candidateIndex] }),
  })
);

export type VoteResponse = typeof voteResponses.$inferSelect;
export type NewVoteResponse = typeof voteResponses.$inferInsert;
