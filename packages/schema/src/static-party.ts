import { z } from "zod";

export const RoleSchema = z.enum(["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"]);
export type Role = z.infer<typeof RoleSchema>;

export const MemberSchema = z.object({
  discordUserId: z.string(),
  characterName: z.string().optional(),
  role: RoleSchema,
  job: z.string().optional().describe("ジョブ略称（例: PLD, WAR, MCH）"),
});
export type Member = z.infer<typeof MemberSchema>;

export const ScheduleSchema = z.object({
  id: z.string(),
  startsAt: z.string().datetime().describe("ISO 8601"),
  durationMinutes: z.number().int().positive().default(180),
  attendees: z.array(z.string()).default([]).describe("出席メンバーのDiscord user ID"),
  notifyMinutesBefore: z.number().int().nonnegative().default(10),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const ProgressSchema = z.object({
  contentId: z.string(),
  currentPhase: z.string().describe("到達中のPhase ID"),
  notes: z.string().optional(),
  updatedAt: z.string().datetime(),
});
export type Progress = z.infer<typeof ProgressSchema>;

export const StaticPartySchema = z.object({
  id: z.string(),
  name: z.string(),
  guildId: z.string().describe("Discord guild (server) ID"),
  contentId: z.string().describe("挑戦中のコンテンツID（Content.id）"),
  leaderId: z.string().describe("固定主のDiscord user ID"),
  members: z.array(MemberSchema),
  schedules: z.array(ScheduleSchema).default([]),
  progress: ProgressSchema.optional(),
  channels: z.object({
    main: z.string().optional(),
    phases: z.record(z.string(), z.string()).default({}).describe("phase id → channel id"),
  }).default({ phases: {} }),
});
export type StaticParty = z.infer<typeof StaticPartySchema>;
