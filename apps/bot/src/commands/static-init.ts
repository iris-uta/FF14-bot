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
import { SETUP_MODE_DESCRIPTIONS, type SetupMode } from "../services/static-channel-template";

export const data = new SlashCommandBuilder()
  .setName("static-init")
  .setDescription("固定を作成 (role + カテゴリ + 全 channels + 各 phase に情報自動投稿)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("コンテンツ種別 (これを選んでから content を選ぶと一覧が絞られる)")
      .setRequired(true)
      .setChoices(
        { name: "絶 (Ultimate)", value: "ultimate" },
        { name: "零式 (Savage)", value: "savage" },
        { name: "極 (Extreme)", value: "extreme" },
        { name: "幻想 (Unreal)", value: "unreal" },
        { name: "異聞 (Variant)", value: "variant" },
        { name: "詩想 (Criterion)", value: "criterion" },
        { name: "アライアンス", value: "alliance" },
        { name: "その他", value: "other" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("content")
      .setDescription("コンテンツID (type で絞り込まれた一覧)")
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
      .setName("mode")
      .setDescription("セットアップテンプレ (default: standard)")
      .setChoices(
        { name: `standard — ${SETUP_MODE_DESCRIPTIONS.standard}`, value: "standard" },
        { name: `race — ${SETUP_MODE_DESCRIPTIONS.race}`, value: "race" },
        { name: `minimal — ${SETUP_MODE_DESCRIPTIONS.minimal}`, value: "minimal" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("members")
      .setDescription("既知メンバー (例: '<@1234> MT PLD, <@5678> ST GNB'). 残りは募集枠扱い。")
      .setMaxLength(1000)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "content") {
    await interaction.respond([]);
    return;
  }
  const typeFilter = interaction.options.getString("type");
  const lower = focused.value.toLowerCase();
  await interaction.respond(
    getAllContents()
      .filter((c) => {
        if (typeFilter && c.type !== typeFilter) return false;
        return (
          c.id.toLowerCase().includes(lower) ||
          c.displayName.toLowerCase().includes(lower) ||
          c.shortName.toLowerCase().includes(lower)
        );
      })
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

  const typeFilter = interaction.options.getString("type", true);
  const contentId = interaction.options.getString("content", true);
  const name = interaction.options.getString("name", true).trim();
  const mode = (interaction.options.getString("mode") ?? "standard") as SetupMode;
  const membersInput = interaction.options.getString("members");

  const content = getContentById(contentId);
  if (!content) {
    await interaction.reply({
      content: `コンテンツが見つかりません: \`${contentId}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (content.type !== typeFilter) {
    await interaction.reply({
      content: `type と content が一致しません。\n選択した type: \`${typeFilter}\` / content (${contentId}) の type: \`${content.type}\``,
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
      mode,
      members: parsedMembers,
    });

    const lobby = result.utilityChannels.find((u) => u.role === "lobby");

    const embed = new EmbedBuilder()
      .setTitle(`⭐ 固定「${name}」を作成しました`)
      .setColor(0x6e85b7)
      .setDescription(
        [
          `**コンテンツ**: ${content.displayName} (${content.shortName})`,
          `**Role**: <@&${result.role.id}>`,
          `**モード**: ${result.mode} (${SETUP_MODE_DESCRIPTIONS[result.mode]})`,
          `**カテゴリ**: ${result.category.name}`,
          lobby ? `**ロビー**: <#${lobby.channelId}>` : null,
          `**スロット**: ${result.filledSlots}/8 確定 (残り ${result.openSlots} 枠)`,
          `**Phase 自動投稿**: ${result.postedPhaseCount}/${result.phaseChannels.length} 成功 (Pin ${result.pinnedCount})`,
        ]
          .filter(Boolean)
          .join("\n")
      )
      .addFields(
        {
          name: `汎用チャネル (${result.utilityChannels.length})`,
          value:
            result.utilityChannels.length > 0
              ? result.utilityChannels.map((u) => `<#${u.channelId}>`).join(" / ")
              : "なし",
        },
        {
          name: `Phaseチャネル (${result.phaseChannels.length})`,
          value: result.phaseChannels.map((c) => `<#${c.channelId}>`).join(" / "),
        }
      );

    const nextSteps: string[] = [];
    if (result.openSlots > 0) {
      nextSteps.push(`• \`/static-fill slot:<role> user:@xxx\` で残り枠を埋める`);
    } else {
      nextSteps.push(`🎉 全枠確定済み！`);
    }
    nextSteps.push(`• \`/schedule when:\"YYYY-MM-DD HH:MM\"\` で次回固定を予約`);
    nextSteps.push(`• \`/macro content:${content.id} phase:p1\` で マクロを取り出す (自分のみ)`);

    embed.addFields({ name: "次の手順", value: nextSteps.join("\n") });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("static-init failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: [
        "❌ 固定作成に失敗しました。",
        "Bot に **Manage Channels** + **Manage Roles** + **Manage Messages** (pin用) 権限があるか確認してください。",
        `エラー: \`${message}\``,
      ].join("\n"),
    });
  }
}
