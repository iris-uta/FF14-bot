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
import { VALID_ROLES, type MemberSpec } from "./members-parser";
import {
  buildChannelTemplate,
  sanitizeUtilityName,
  type SetupMode,
  type UtilityChannel,
} from "./static-channel-template";
import { postPhaseToChannel, postUtilityIntro } from "./phase-channel-poster";

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
  mode?: SetupMode;
  strategyId?: string;
  members?: MemberSpec[];
  // TODO Phase B: planId / plan slots
}

export interface InitStaticResult {
  static: Static;
  category: CategoryChannel;
  role: Role;
  utilityChannels: { name: string; channelId: string; role?: string }[];
  phaseChannels: { phaseId: string; channelId: string }[];
  postedPhaseCount: number;
  pinnedCount: number;
  filledSlots: number;
  openSlots: number;
  mode: SetupMode;
}

/**
 * Check if a static with this name already exists in the guild.
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
 * Create role + category + channels + DB records + (optional) member assignments
 * + auto-post phase info to each Phase channel + intro messages to utility channels.
 */
export async function initStatic(input: InitStaticInput): Promise<InitStaticResult> {
  const { guild, leaderId, name, content, strategyId, members } = input;
  const mode: SetupMode = input.mode ?? "standard";

  // 1. Create role
  const role = await guild.roles.create({
    name,
    color: ROLE_COLOR_BY_TYPE[content.type] ?? ROLE_COLOR_BY_TYPE.other,
    mentionable: true,
    reason: `Created by /static-init for content ${content.id}`,
  });

  // 2. Create category (role-visible)
  const categoryName = `${name} 固定`.slice(0, 100);
  const category = (await guild.channels.create({
    name: categoryName,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: role.id, allow: [PermissionFlagsBits.ViewChannel] },
    ],
  })) as CategoryChannel;

  // 3. Build channel template + create channels
  const template = buildChannelTemplate(content, { mode, partyName: name });

  const utilityChannels: { name: string; channelId: string; role?: string; channel: TextChannel }[] = [];
  for (const spec of template.utility) {
    try {
      const ch = (await guild.channels.create({
        name: sanitizeUtilityName(spec.name),
        type: ChannelType.GuildText,
        parent: category.id,
        topic: spec.topic,
      })) as TextChannel;
      utilityChannels.push({ name: spec.name, channelId: ch.id, role: spec.role, channel: ch });
    } catch (err) {
      console.warn(`Failed to create utility channel ${spec.name}:`, err);
    }
  }

  const phaseChannels: { phaseId: string; channelId: string; channel: TextChannel }[] = [];
  for (const spec of template.phases) {
    const ch = (await guild.channels.create({
      name: spec.name,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: spec.topic || undefined,
    })) as TextChannel;
    phaseChannels.push({ phaseId: spec.phaseId, channelId: ch.id, channel: ch });
  }

  // 4. DB: statics + 8 slots + members
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const lobby = utilityChannels.find((c) => c.role === "lobby");
  const newStatic: NewStatic = {
    id,
    guildId: guild.id,
    leaderId,
    name,
    contentId: content.id,
    strategyId: strategyId ?? null,
    roleId: role.id,
    categoryId: category.id,
    lobbyChannelId: lobby?.channelId ?? null,
    recruitmentChannelId: null,
    currentPhaseId: null,
    pausedUntil: null,
    planId: null,
    createdAt: now,
  };
  db.insert(statics).values(newStatic).run();

  for (const r of VALID_ROLES) {
    db.insert(staticSlots)
      .values({
        staticId: id,
        role: r,
        status: "open",
        jobs: null,
        assigneeUserId: null,
        job: null,
        filledAt: null,
      })
      .run();
  }

  // Apply member assignments
  let filledSlotCount = 0;
  if (members && members.length > 0) {
    for (const m of members) {
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

      try {
        const guildMember = await guild.members.fetch(m.userId);
        await guildMember.roles.add(role.id);
      } catch (err) {
        console.warn(`Failed to grant role to ${m.userId}:`, err);
      }
    }
  }

  // 5. Auto-post intros + phase content (best-effort, errors logged but don't fail setup)
  let postedPhaseCount = 0;
  let pinnedCount = 0;

  // Utility intros
  for (const u of utilityChannels) {
    if (u.role) {
      await postUtilityIntro(u.channel, content, u.role);
    }
  }

  // Phase channels: embed + macros + pin
  for (const pc of phaseChannels) {
    const phase = content.phases.find((p) => p.id === pc.phaseId);
    if (!phase) continue;
    const result = await postPhaseToChannel(pc.channel, content, phase, {
      includeMacros: true,
      pin: true,
    });
    if (result.ok) postedPhaseCount++;
    if (result.pinned) pinnedCount++;
  }

  return {
    static: newStatic as Static,
    category,
    role,
    utilityChannels: utilityChannels.map(({ channel: _, ...rest }) => rest),
    phaseChannels: phaseChannels.map(({ channel: _, ...rest }) => rest),
    postedPhaseCount,
    pinnedCount,
    filledSlots: filledSlotCount,
    openSlots: VALID_ROLES.length - filledSlotCount,
    mode,
  };
}
