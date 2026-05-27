import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import {
  buildStaticOverview,
  listStaticsInGuild,
  renderStaticInfoEmbed,
} from "../services/static-info";
import { findStaticByName, findStaticForChannel } from "../services/static-manager";

export const data = new SlashCommandBuilder()
  .setName("static-info")
  .setNameLocalizations({ ja: "固定情報" })
  .setDescription("固定の現状 (slot fill / メンバー / 直近予定) を表示")
  .setDescriptionLocalizations({ ja: "固定の現状 (slot fill / メンバー / 直近予定) を表示" })
  // Everyone can view (read-only)
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setNameLocalizations({ ja: "固定名" })
      .setDescription("固定名 (省略時は現在のチャネルから自動検出)")
      .setDescriptionLocalizations({ ja: "固定名 (省略時は現在のチャネルから自動検出)" })
      .setAutocomplete(true)
      .setMaxLength(80)
  )
  .addBooleanOption((opt) =>
    opt
      .setName("public")
      .setNameLocalizations({ ja: "公開投稿" })
      .setDescription("true なら channel に投稿、false (default) は ephemeral")
      .setDescriptionLocalizations({ ja: "true なら channel に投稿、false (default) は ephemeral" })
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused();
  const list = listStaticsInGuild(interaction.guildId)
    .filter((s) => s.name.toLowerCase().includes(focused.toLowerCase()))
    .slice(0, 25)
    .map((s) => ({ name: s.name.slice(0, 100), value: s.name.slice(0, 100) }));
  await interaction.respond(list);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "このコマンドはサーバー内で実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Resolve which static to show:
  // 1. explicit name option, OR
  // 2. channel-based auto-detect
  const nameOpt = interaction.options.getString("name");
  let target = nameOpt ? findStaticByName(interaction.guildId, nameOpt) : null;

  if (!target) {
    const channel = interaction.channel;
    if (channel) {
      const parentId = "parentId" in channel ? channel.parentId : null;
      target = findStaticForChannel(interaction.guildId, channel.id, parentId);
    }
  }

  if (!target) {
    const helpMsg = nameOpt
      ? `固定が見つかりません: \`${nameOpt}\``
      : "現在のチャネルは固定に紐付いていません。`/static-info name:<固定名>` で明示指定してください。";
    await interaction.reply({ content: helpMsg, flags: MessageFlags.Ephemeral });
    return;
  }

  const overview = buildStaticOverview(target.id);
  if (!overview) {
    await interaction.reply({
      content: `固定情報の取得に失敗しました: ${target.name}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = renderStaticInfoEmbed(overview);
  const isPublic = interaction.options.getBoolean("public") ?? false;
  await interaction.reply({
    embeds: [embed],
    flags: isPublic ? undefined : MessageFlags.Ephemeral,
  });
}
