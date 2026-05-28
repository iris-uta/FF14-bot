/**
 * /role-pick — manual role-picker for existing members.
 *
 * Same UI as the auto-welcome on guild-join, but anyone can summon it on demand.
 * Useful for:
 *   - Members who joined before the bot was added
 *   - Members who missed/deleted the welcome message
 *   - Re-assignment when their role changes
 */
import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { buildMemberWelcomeMessage } from "../services/member-welcome";

export const data = new SlashCommandBuilder()
  .setName("role-pick")
  .setNameLocalizations({ ja: "ロール選択" })
  .setDescription("自分の game role (MT/ST/H1/H2/D1-D4) を選んで job ロールを取得")
  .setDescriptionLocalizations({ ja: "自分の game role を選んで job ロール (タンク/ヒーラー/DPS) を取得" })
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
  .addBooleanOption((opt) =>
    opt
      .setName("public")
      .setNameLocalizations({ ja: "公開投稿" })
      .setDescription("true なら channel に投稿 (default: 自分だけ ephemeral)")
      .setDescriptionLocalizations({ ja: "true なら channel に投稿 (default: 自分だけ ephemeral)" })
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.member) {
    await interaction.reply({
      content: "このコマンドはサーバー内で実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const member = interaction.member as GuildMember;
  const msg = buildMemberWelcomeMessage(member);
  const isPublic = interaction.options.getBoolean("public") ?? false;
  await interaction.reply({
    content: msg.content,
    embeds: msg.embeds,
    components: msg.components,
    flags: isPublic ? undefined : MessageFlags.Ephemeral,
    allowedMentions: isPublic ? { parse: [], users: [member.id] } : { parse: [] },
  });
}
