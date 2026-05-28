/**
 * Member welcome flow — runs on `Events.GuildMemberAdd`.
 *
 * Posts a welcome message in the system channel (or fallback) with 8 buttons
 * for the user to pick their game role. The click handler assigns the matching
 * job-category role (タンク / ヒーラー / DPS).
 *
 * Requires the privileged `GuildMembers` intent (must be enabled in the
 * Discord Developer Portal). Without it, GuildMemberAdd events never fire.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  type ButtonInteraction,
  type GuildMember,
  type GuildTextBasedChannel,
} from "discord.js";
import {
  GAME_ROLES,
  JOB_CATEGORY_SPEC,
  assignJobRoleByGameRole,
  categoryForGameRole,
  type GameRole,
} from "./job-roles.js";

export const ROLE_PICK_PREFIX = "role-pick:";

/**
 * Build the welcome embed + the 2 ActionRows of 4 buttons each (8 total).
 *
 * Layout (matches FF14 party order):
 *   Row 1: 🛡️ MT   🛡️ ST   💚 H1   💚 H2
 *   Row 2: ⚔️ D1   ⚔️ D2   ⚔️ D3   ⚔️ D4
 */
export function buildMemberWelcomeMessage(member: GuildMember): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  content: string;
} {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${member.displayName} さん、 ようこそ！`)
    .setColor(0x6e85b7)
    .setDescription(
      [
        `あなたが担当するロールを下のボタンから選んでください。`,
        `自動で **${JOB_CATEGORY_SPEC.tank.emoji} タンク** / **${JOB_CATEGORY_SPEC.healer.emoji} ヒーラー** / **${JOB_CATEGORY_SPEC.dps.emoji} DPS** のロールが付与されます。`,
        ``,
        `(後で変更したくなったら同じボタンをもう一度押せば切り替わります)`,
      ].join("\n")
    );

  const tankRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(["MT", "ST", "H1", "H2"] as GameRole[]).map((r) => buildRoleButton(r))
  );
  const dpsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(["D1", "D2", "D3", "D4"] as GameRole[]).map((r) => buildRoleButton(r))
  );

  return {
    content: `<@${member.id}>`,
    embeds: [embed],
    components: [tankRow, dpsRow],
  };
}

function buildRoleButton(role: GameRole): ButtonBuilder {
  const cat = categoryForGameRole(role);
  const spec = JOB_CATEGORY_SPEC[cat];
  return new ButtonBuilder()
    .setCustomId(`${ROLE_PICK_PREFIX}${role}`)
    .setLabel(role)
    .setEmoji(spec.emoji)
    .setStyle(
      cat === "tank" ? ButtonStyle.Primary
      : cat === "healer" ? ButtonStyle.Success
      : ButtonStyle.Danger
    );
}

/**
 * Find the best channel to post the welcome message in.
 * Same priority as static welcome-channel finder.
 */
function findWelcomeChannel(member: GuildMember): GuildTextBasedChannel | null {
  const me = member.guild.members.me;
  if (!me) return null;

  const sys = member.guild.systemChannel;
  if (sys && sys.isTextBased() && sys.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages)) {
    return sys;
  }

  const candidates = Array.from(member.guild.channels.cache.values())
    .filter(
      (c): c is GuildTextBasedChannel & { position: number } =>
        c.type === ChannelType.GuildText &&
        c.isTextBased() &&
        c.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages) === true
    )
    .sort((a, b) => a.position - b.position);

  return candidates[0] ?? null;
}

/**
 * Post the welcome message for a new guild member.
 * Best-effort: failures are logged but don't propagate (we never want a join to
 * be blocked by a bot failure).
 */
export async function postMemberWelcome(member: GuildMember): Promise<void> {
  // Skip bots — they don't pick game roles
  if (member.user.bot) return;
  const channel = findWelcomeChannel(member);
  if (!channel) {
    console.warn(`member-welcome: no sendable channel in ${member.guild.name}`);
    return;
  }
  try {
    const msg = buildMemberWelcomeMessage(member);
    await channel.send({
      content: msg.content,
      embeds: msg.embeds,
      components: msg.components,
      allowedMentions: { parse: [], users: [member.id] }, // ping the joiner only
    });
  } catch (err) {
    console.error(`member-welcome: failed to post in ${member.guild.name}:`, err);
  }
}

// ── Button click handler ────────────────────────────────────────────────────

/** customId: `role-pick:MT` etc — returns parsed role or null */
export function parseRolePickCustomId(customId: string): GameRole | null {
  if (!customId.startsWith(ROLE_PICK_PREFIX)) return null;
  const value = customId.slice(ROLE_PICK_PREFIX.length);
  if ((GAME_ROLES as readonly string[]).includes(value)) return value as GameRole;
  return null;
}

export async function handleRolePickButton(interaction: ButtonInteraction): Promise<void> {
  const role = parseRolePickCustomId(interaction.customId);
  if (!role) {
    await interaction.reply({
      content: "ボタン ID が不正です。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.inCachedGuild() || !interaction.member) {
    await interaction.reply({
      content: "このボタンはサーバー内でのみ動作します。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Anyone can pick a role — the welcome message is for the original joiner
  // but allowing other members to use the buttons (e.g., re-assign themselves
  // when they see someone else's welcome) is a nice extra. They get their own
  // role, never someone else's.
  const member = interaction.member as GuildMember;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let category;
  try {
    category = await assignJobRoleByGameRole(member, role);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await interaction.editReply({ content: `❌ ${msg}` });
    return;
  }

  const spec = JOB_CATEGORY_SPEC[category];
  await interaction.editReply({
    content: `${spec.emoji} **${role}** を選びました。 ${spec.name} ロールを付与しました。`,
  });
}
