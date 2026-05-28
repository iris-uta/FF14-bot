import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { buildWelcomeEmbed } from "../services/welcome";

/**
 * /quickstart — re-display the welcome / onboarding embed.
 *
 * Use cases:
 *   - Late-joining members who missed the GuildCreate welcome
 *   - Anyone who wants a refresher
 *   - Servers where the bot was added before this feature existed
 *
 * Default: ephemeral so it doesn't spam the channel.
 * `public: true` re-broadcasts to the channel (useful for shared servers).
 */
export const data = new SlashCommandBuilder()
  .setName("quickstart")
  .setNameLocalizations({ ja: "はじめに" })
  .setDescription("Bot の使い方を 3 ステップで表示 (新規/初めての人向け)")
  .setDescriptionLocalizations({ ja: "Bot の使い方を 3 ステップで表示 (新規/初めての人向け)" })
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
  .addBooleanOption((opt) =>
    opt
      .setName("public")
      .setNameLocalizations({ ja: "公開投稿" })
      .setDescription("true なら channel に投稿 (default: 自分だけ ephemeral)")
      .setDescriptionLocalizations({ ja: "true なら channel に投稿 (default: 自分だけ ephemeral)" })
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = buildWelcomeEmbed();
  const isPublic = interaction.options.getBoolean("public") ?? false;
  await interaction.reply({
    embeds: [embed],
    flags: isPublic ? undefined : MessageFlags.Ephemeral,
  });
}
