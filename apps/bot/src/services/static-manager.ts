import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type CategoryChannel,
  type Role,
  type TextChannel,
} from "discord.js";
import {
  statics,
  staticSlots,
  staticMembers,
  type NewStatic,
  type Static,
} from "@ff14kotei/db";
import type { Content } from "@ff14kotei/schema";
import { getDb } from "../lib/db";
import { buildChannelPlan } from "./channel-setup";
import { VALID_ROLES, type GameRole, type MemberSpec } from "./members-parser";

/**
 * Role colors per content type. Discord uses integer RGB.
 */
const ROLE_COLOR_BY_TYPE: Record<string, number> = {
  ultimate: 0xff5050,
  savage: 0xaa3030,
  extreme: 0xe07a3a,
  unreal: 0x7f5af0,
  variant: 0x4dabf7,
  criterion: 0x2a9d8f,
  alliance: 0x9f86c0,
  other: 0x808080,
};

export interface InitStaticInput {
  guild: Guild;
  leaderId: string;
  name: string;
  content: Content;
  strategyId?: string;
  members?: MemberSpec[];
  // TODO Phase B: planId / plan slots
}

export interface InitStaticResult {
  static: Static;
  category: CategoryChannel;
  role: Role;
  lobbyChannel: TextChannel | null;
  phaseChannels: { phaseId: string; channelId: string }[];
  filledSlots: number;
  openSlots: number;
}

/**
 * Check if a static with this name already exists in the guild.
 * Used to prevent duplicate / collision before doing irreversible work.
 */
export function findStaticByName(guildId: string, name: string): Static | null {
  const db = getDb();
  const existing = db
    .select()
    .from(statics)
    .where(and(eq(statics.guildId, guildId), eq(statics.name, name)))
    .get();
  return existing ?? null;
}

/**
 * Create role + category + channels + DB records + (optional) member assignments.
 * Throws on Discord API failure; caller should report to user.
 *
 * Channel naming follows existing `buildChannelPlan` (already used by /setup-static).
 * In addition, prepends a lobby channel for general chat.
 */
export async function initStatic(input: InitStaticInput): Promise<InitStaticResult> {
  const { guild, leaderId, name, content, strategyId, members } = input;

  // 1. Create role
  const role = await guild.roles.create({
    name,
    color: ROLE_COLOR_BY_TYPE[content.type] ?? ROLE_COLOR_BY_TYPE.other,
    mentionable: true,
    reason: `Created by /static-init for content ${content.id}`,
  });

  // 2. Create category
  const categoryName = `${name} 固定`.slice(0, 100);
  const category = (await guild.channels.create({
    name: categoryName,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      // Make category role-visible. Public access stays as guild default.
      {
        id: role.id,
        allow: [PermissionFlagsBits.ViewChannel],
      },
    ],
  })) as CategoryChannel;

  // 3. Lobby + Phase channels
  const plan = buildChannelPlan(content, { partyName: name });
  let lobby: TextChannel | null = null;
  try {
    lobby = (await guild.channels.create({
      name: "ロビー",
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `${content.displayName} 固定の総合チャネル`,
    })) as TextChannel;
  } catch {
    // ignore — lobby is optional
  }

  const phaseChannels: { phaseId: string; channelId: string }[] = [];
  for (const spec of plan.channels) {
    const ch = await guild.channels.create({
      name: spec.name,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: spec.topic || undefined,
    });
    phaseChannels.push({ phaseId: spec.phaseId, channelId: ch.id });
  }

  // 4. DB: statics + 8 slots + members
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const newStatic: NewStatic = {
    id,
    guildId: guild.id,
    leaderId,
    name,
    contentId: content.id,
    strategyId: strategyId ?? null,
    roleId: role.id,
    categoryId: category.id,
    lobbyChannelId: lobby?.id ?? null,
    recruitmentChannelId: null,
    currentPhaseId: null,
    pausedUntil: null,
    planId: null,
    createdAt: now,
  };
  db.insert(statics).values(newStatic).run();

  // Initialize 8 slots all as "open"
  for (const role of VALID_ROLES) {
    db.insert(staticSlots)
      .values({
        staticId: id,
        role,
        status: "open",
        jobs: null,
        assigneeUserId: null,
        job: null,
        filledAt: null,
      })
      .run();
  }

  // Apply member assignments (fill matching slots + add to members + grant Discord role)
  let filledSlotCount = 0;
  if (members && members.length > 0) {
    for (const m of members) {
      // Update slot to filled
      db.update(staticSlots)
        .set({
          status: "filled",
          assigneeUserId: m.userId,
          job: m.job,
          filledAt: now,
        })
        .where(and(eq(staticSlots.staticId, id), eq(staticSlots.role, m.role)))
        .run();
      filledSlotCount++;

      // Add to staticMembers
      db.insert(staticMembers)
        .values({
          staticId: id,
          userId: m.userId,
          gameRole: m.role,
          job: m.job,
          joinedAt: now,
          leftAt: null,
        })
        .run();

      // Grant Discord role (best-effort, ignore individual failures)
      try {
        const guildMember = await guild.members.fetch(m.userId);
        await guildMember.roles.add(role.id);
      } catch (err) {
        console.warn(`Failed to grant role to ${m.userId}:`, err);
      }
    }
  }

  return {
    static: { ...newStatic, strategyId: newStatic.strategyId ?? null } as Static,
    category,
    role,
    lobbyChannel: lobby,
    phaseChannels,
    filledSlots: filledSlotCount,
    openSlots: VALID_ROLES.length - filledSlotCount,
  };
}
