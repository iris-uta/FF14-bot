import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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
  createdAt: integer("created_at").notNull(),
  createdBy: text("created_by").notNull(),
});

export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
