/**
 * Job-category role management — タンク / ヒーラー / DPS.
 *
 * These are persistent Discord roles auto-created on first use, shared across
 * all statics in a guild. The 8 game-role labels (MT/ST/H1/H2/D1-D4) map to
 * one of the 3 categories.
 */
import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Role,
} from "discord.js";

export type JobCategory = "tank" | "healer" | "dps";

export type GameRole = "MT" | "ST" | "H1" | "H2" | "D1" | "D2" | "D3" | "D4";

export const GAME_ROLES: readonly GameRole[] = ["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"];

/** Map slot role → job category */
export function categoryForGameRole(role: GameRole): JobCategory {
  if (role === "MT" || role === "ST") return "tank";
  if (role === "H1" || role === "H2") return "healer";
  return "dps";
}

export const JOB_CATEGORY_SPEC: Record<JobCategory, { name: string; color: number; emoji: string }> = {
  tank:   { name: "タンク",   color: 0x3498db, emoji: "🛡️" }, // blue
  healer: { name: "ヒーラー", color: 0x2ecc71, emoji: "💚" }, // green
  dps:    { name: "DPS",      color: 0xe74c3c, emoji: "⚔️" }, // red
};

export interface JobRoleSet {
  tank: Role;
  healer: Role;
  dps: Role;
}

/**
 * Get or create the 3 job-category roles in a guild.
 * Match is by name (case-sensitive against JOB_CATEGORY_SPEC[*].name).
 * Creates with the spec color + mentionable + hoisted=true (separates in member list).
 */
export async function getOrCreateJobRoles(guild: Guild): Promise<JobRoleSet> {
  const out: Partial<JobRoleSet> = {};
  for (const [cat, spec] of Object.entries(JOB_CATEGORY_SPEC) as [JobCategory, typeof JOB_CATEGORY_SPEC[JobCategory]][]) {
    const existing = guild.roles.cache.find((r) => r.name === spec.name);
    if (existing) {
      out[cat] = existing;
      continue;
    }
    const created = await guild.roles.create({
      name: spec.name,
      color: spec.color,
      mentionable: true,
      hoist: true,
      reason: `固定支援Bot: auto-created ${cat} role`,
      permissions: [],
    });
    out[cat] = created;
  }
  return out as JobRoleSet;
}

/**
 * Assign the job role matching the given game role to a member.
 * Also removes the other 2 job roles so the member only has one (re-assignment ok).
 *
 * Returns the assigned category.
 *
 * Throws if the bot lacks ManageRoles, is below the target role in hierarchy,
 * or the member is the guild owner (cannot modify owner's roles).
 */
export async function assignJobRoleByGameRole(
  member: GuildMember,
  gameRole: GameRole
): Promise<JobCategory> {
  const guild = member.guild;
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error("Bot に Manage Roles 権限がありません。");
  }
  // Guild owner roles cannot be modified by bots; member.roles.add will error
  if (member.id === guild.ownerId) {
    throw new Error("guild owner の role は bot が変更できません。");
  }

  const targetCat = categoryForGameRole(gameRole);
  const roles = await getOrCreateJobRoles(guild);

  // Check hierarchy: bot's top role must be > target role
  if (me.roles.highest.position <= roles[targetCat].position) {
    throw new Error(
      `Bot の role 階層が ${roles[targetCat].name} より下にあります。 サーバー設定 → ロール で bot role を上に移動してください。`
    );
  }

  // Remove the other 2 job roles if present (idempotent re-assignment)
  const allJobIds = new Set([roles.tank.id, roles.healer.id, roles.dps.id]);
  const toRemove = member.roles.cache.filter(
    (r) => allJobIds.has(r.id) && r.id !== roles[targetCat].id
  );
  if (toRemove.size > 0) {
    await member.roles.remove([...toRemove.keys()], `固定支援Bot: switching job role to ${targetCat}`);
  }

  // Add target role (no-op if already has it)
  if (!member.roles.cache.has(roles[targetCat].id)) {
    await member.roles.add(roles[targetCat].id, `固定支援Bot: assigned via /role-pick`);
  }

  return targetCat;
}
