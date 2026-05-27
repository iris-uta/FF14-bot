import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

/**
 * Scheduled events (固定活動の予定). Used by B-5 alert worker.
 * Times are stored as Unix milliseconds (UTC) to avoid timezone issues.
 */
export const schedules = sqliteTable(
  "schedules",
  {
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
  },
  (t) => ({
    // alert-worker scans `WHERE notified_at IS NULL` every 30s — by far the hottest path.
    notifiedAtIdx: index("schedules_notified_at_idx").on(t.notifiedAt),
    // /upcoming + static-info filter by guild / static.
    guildIdIdx: index("schedules_guild_id_idx").on(t.guildId),
    staticIdIdx: index("schedules_static_id_idx").on(t.staticId),
  })
);

export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;

/**
 * Static party (固定). Created by /static-init.
 * One static per (guildId, name) — Discord role and category are owned by it.
 */
export const statics = sqliteTable(
  "statics",
  {
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
  },
  (t) => ({
    // findStaticByName / listStaticsInGuild — every autocomplete call.
    guildIdIdx: index("statics_guild_id_idx").on(t.guildId),
    // findStaticForChannel — every auto-detect.
    lobbyChannelIdx: index("statics_lobby_channel_idx").on(t.lobbyChannelId),
    categoryIdIdx: index("statics_category_idx").on(t.categoryId),
  })
);

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
    // static-info の active メンバー lookup (leftAt IS NULL).
    staticLeftAtIdx: index("static_members_static_left_at_idx").on(t.staticId, t.leftAt),
  })
);

export type StaticMember = typeof staticMembers.$inferSelect;
export type NewStaticMember = typeof staticMembers.$inferInsert;

/**
 * Vote (調整さん代替の self-hosted 投票).
 * 1 vote = 1 質問 with 1〜5 候補。
 * candidates は JSON: [{index, label}]。
 */
export const votes = sqliteTable(
  "votes",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id"),                 // 投稿後にセット (re-render 用)
    creatorId: text("creator_id").notNull(),
    title: text("title").notNull(),
    candidates: text("candidates").notNull(),       // JSON: [{index:number, label:string, startsAt?:number}]
    closesAt: integer("closes_at"),                  // null = 締切なし
    closed: integer("closed", { mode: "boolean" }).notNull().default(false),
    staticId: text("static_id"),                     // 固定 channel から自動検出 (optional)
    mention: text("mention"),                        // /vote new で指定 or 固定 role mention
    reminderHoursBefore: integer("reminder_hours_before"),  // 締切何時間前にリマインダー (null = なし)
    remindedAt: integer("reminded_at"),              // リマインダー送信済みなら timestamp
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    // listOpenVotesInGuild + listVotesInGuild (autocomplete every keystroke).
    guildClosedIdx: index("votes_guild_closed_idx").on(t.guildId, t.closed),
    // vote-closer worker: WHERE closed=0 AND closes_at <= now (every 30s).
    closedClosesAtIdx: index("votes_closed_closes_at_idx").on(t.closed, t.closesAt),
    // vote-reminder worker: WHERE closed=0 AND reminded_at IS NULL (every 30s).
    closedRemindedIdx: index("votes_closed_reminded_idx").on(t.closed, t.remindedAt),
  })
);

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

/**
 * Progress log — 固定の進行マイルストーン。
 * 例: "P3 到達 2026-05-10"、"撃破 2026-06-15"
 *
 * status は自由文だが UI では以下を提案:
 *   - reached  : 初めて到達
 *   - cleared  : phase 撃破
 *   - first-clear: 初見クリア (記念)
 *   - note     : freeform メモ
 */
export const progressLogs = sqliteTable(
  "progress_logs",
  {
    id: text("id").primaryKey(),
    staticId: text("static_id").notNull(),
    guildId: text("guild_id").notNull(),         // query 用
    userId: text("user_id").notNull(),           // 記録者
    phaseId: text("phase_id"),                    // 例: "p3"。note タイプなら null 可
    status: text("status").notNull(),             // reached / cleared / first-clear / note
    note: text("note"),                            // 任意の追加コメント
    loggedAt: integer("logged_at").notNull(),     // ユーザー指定の日付 (or now)
    createdAt: integer("created_at").notNull(),   // record 作成時刻
  },
  (t) => ({
    // listProgressLogsForStatic — every /progress show.
    staticIdIdx: index("progress_logs_static_id_idx").on(t.staticId),
  })
);

export type ProgressLog = typeof progressLogs.$inferSelect;
export type NewProgressLog = typeof progressLogs.$inferInsert;

/**
 * Recurring schedule rule (定期予定). 例: 毎週金曜 21:00 JST。
 * worker (recurring-scheduler) が定期的に次の occurrence を計算して
 * schedules テーブルに insert する → 既存 alert-worker が通知する。
 *
 * Weekday: 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土 (JST)
 */
export const recurringSchedules = sqliteTable(
  "recurring_schedules",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),         // alert post 先
    contentId: text("content_id"),                    // optional
    phaseId: text("phase_id"),                        // optional
    staticId: text("static_id"),                       // 固定 channel 自動検出
    weekday: integer("weekday").notNull(),             // 0-6 (JST)
    hourJst: integer("hour_jst").notNull(),            // 0-23
    minuteJst: integer("minute_jst").notNull(),        // 0-59
    notifyMinutesBefore: integer("notify_minutes_before").notNull().default(10),
    mention: text("mention"),
    note: text("note"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastInsertedAt: integer("last_inserted_at"),       // 最後にこのルールで insert した occurrence (Unix ms)
    createdAt: integer("created_at").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (t) => ({
    guildActiveIdx: index("recurring_guild_active_idx").on(t.guildId, t.active),
    createdByIdx: index("recurring_created_by_idx").on(t.createdBy),
  })
);

export type RecurringSchedule = typeof recurringSchedules.$inferSelect;
export type NewRecurringSchedule = typeof recurringSchedules.$inferInsert;
