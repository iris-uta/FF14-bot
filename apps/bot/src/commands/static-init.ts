import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getAllContents, getContentById } from "../lib/contents";
import { findStaticByName, initStatic } from "../services/static-manager";
import { parseMembers, checkRoleUniqueness, MemberSpecParseError } from "../services/members-parser";

export const data = new SlashCommandBuilder()
  .setName("static-init")
  .setDescription("固定を作成 (role + カテゴリ + Phase channels + メンバー登録)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addStringOption((opt) =>
    opt
      .setName("content")
      .setDescription("コンテンツID (例: fru)")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("固定の名前 (Discord role 名にもなる)")
      .setRequired(true)
      .setMaxLength(80)
  )
  .addStringOption((opt) =>
    opt
      .setName("members")
      .setDescription("既知メンバー (例: '<@1234> MT PLD, <@5678> ST GNB'). 残りは募集枠扱い。")
      .setMaxLength(1000)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  await interaction.respond(
    getAllContents()
      .filter(
        (c) =>
          c.id.toLowerCase().includes(focused) ||
          c.displayName.toLowerCase().includes(focused) ||
          c.shortName.toLowerCase().includes(focused)
      )
      .slice(0, 25)
      .map((c) => ({ name: `${c.displayName} (${c.shortName})`, value: c.id }))
  );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: "このコマンドはサーバー内で実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const contentId = interaction.options.getString("content", true);
  const name = interaction.options.getString("name", true).trim();
  const membersInput = interaction.options.getString("members");

  const content = getContentById(contentId);
  if (!content) {
    await interaction.reply({
      content: `コンテンツが見つかりません: \`${contentId}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (name === "") {
    await interaction.reply({
      content: "name は空にできません。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Check name collision in this guild
  const existing = findStaticByName(interaction.guild.id, name);
  if (existing) {
    await interaction.reply({
      content: `固定「${name}」は既に存在します (${new Date(existing.createdAt).toLocaleString("ja-JP")})。別名を指定してください。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Parse members (if provided)
  let parsedMembers;
  if (membersInput) {
    try {
      parsedMembers = parseMembers(membersInput);
    } catch (err) {
      if (err instanceof MemberSpecParseError) {
        await interaction.reply({
          content: `members パース失敗: ${err.message}\n例: \`<@1234> MT PLD, <@5678> ST GNB\``,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      throw err;
    }
    const uniqueness = checkRoleUniqueness(parsedMembers);
    if (!uniqueness.ok) {
      await interaction.reply({
        content: `重複したロール: ${uniqueness.duplicateRoles.join(", ")}。各ロールは1人まで。`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  await interaction.deferReply();

  try {
    const result = await initStatic({
      guild: interaction.guild,
      leaderId: interaction.user.id,
      name,
      content,
      members: parsedMembers,
    });

    const embed = new EmbedBuilder()
      .setTitle(`⭐ 固定「${name}」を作成しました`)
      .setColor(0x6e85b7)
      .setDescription(
        [
          `**コンテンツ**: ${content.displayName} (${content.shortName})`,
          `**Role**: <@&${result.role.id}>`,
          `**カテゴリ**: ${result.category.name}`,
          result.lobbyChannel ? `**ロビー**: <#${result.lobbyChannel.id}>` : null,
          `**スロット**: ${result.filledSlots}/8 確定 (残り ${result.openSlots} 枠)`,
        ]
          .filter(Boolean)
          .join("\n")
      )
      .addFields({
        name: "Phaseチャネル",
        value: result.phaseChannels
          .map((c) => `<#${c.channelId}>`)
          .join(" / "),
      });

    if (result.openSlots > 0) {
      embed.addFields({
        name: "次の手順",
        value: [
          `• \`/static-fill slot:<role> user:@xxx\` で残り枠を埋める`,
          `• \`/post-phase content:${content.id} phase:p1\` で各 Phase チャネルに情報を投稿`,
          `• \`/schedule when:\"...\"\` で次回固定を予約`,
        ].join("\n"),
      });
    } else {
      embed.addFields({
        name: "次の手順",
        value: [
          `🎉 全枠確定済み！`,
          `• \`/post-phase content:${content.id} phase:p1\` で各 Phase チャネルに情報を投稿`,
          `• \`/schedule when:\"...\"\` で次回固定を予約`,
        ].join("\n"),
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("static-init failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: [
        "❌ 固定作成に失敗しました。",
        "Bot に **Manage Channels** + **Manage Roles** 権限があるか確認してください。",
        `エラー: \`${message}\``,
      ].join("\n"),
    });
  }
}
