import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { getAllContents, getContentById } from "../lib/contents";
import { sortByPatch } from "../lib/content-sort";
import { configureContentTypeOption } from "../lib/content-type-choices";
import { findStaticByName, initStatic } from "../services/static-manager";
import { parseMembers, checkRoleUniqueness, MemberSpecParseError } from "../services/members-parser";
import { SETUP_MODE_DESCRIPTIONS, type SetupMode } from "../services/static-channel-template";
import { buildStepMessage, putWizard, type WizardState } from "../services/setup-wizard";

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setNameLocalizations({ ja: "固定作成" })
  .setDescription("固定を作成 (role + カテゴリ + 全 channels + 各 phase に情報自動投稿)")
  .setDescriptionLocalizations({
    ja: "固定を一括作成 (Discord role + カテゴリ + 全 channels + Phase 情報自動投稿)",
  })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setNameLocalizations({ ja: "固定名" })
      .setDescription("固定の名前 (Discord role 名にもなる)")
      .setDescriptionLocalizations({ ja: "固定の名前 (Discord role 名にもなる)" })
      .setRequired(true)
      .setMaxLength(80)
  )
  .addStringOption((opt) => configureContentTypeOption(opt, { required: false }))
  .addStringOption((opt) =>
    opt
      .setName("content")
      .setNameLocalizations({ ja: "コンテンツ" })
      .setDescription("コンテンツID (省略時は button wizard で選択)")
      .setDescriptionLocalizations({ ja: "コンテンツID (省略時は button wizard で選択)" })
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("mode")
      .setNameLocalizations({ ja: "モード" })
      .setDescription("セットアップテンプレ (default: standard)")
      .setDescriptionLocalizations({ ja: "セットアップテンプレ (default: standard)" })
      .setChoices(
        { name: `standard — ${SETUP_MODE_DESCRIPTIONS.standard}`, value: "standard" },
        { name: `race — ${SETUP_MODE_DESCRIPTIONS.race}`, value: "race" },
        { name: `minimal — ${SETUP_MODE_DESCRIPTIONS.minimal}`, value: "minimal" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("members")
      .setNameLocalizations({ ja: "メンバー" })
      .setDescription("既知メンバー (例: '<@1234> MT PLD, <@5678> ST GNB'). 残りは募集枠扱い。")
      .setDescriptionLocalizations({
        ja: "既知メンバー (例: '<@1234> MT PLD, <@5678> ST GNB')。残りは募集枠扱い。",
      })
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
  const matched = getAllContents().filter((c) => {
    if (typeFilter && c.type !== typeFilter) return false;
    return (
      c.id.toLowerCase().includes(lower) ||
      c.displayName.toLowerCase().includes(lower) ||
      c.shortName.toLowerCase().includes(lower)
    );
  });
  await interaction.respond(
    sortByPatch(matched)
      .slice(0, 25)
      .map((c) => ({
        name: `${c.patch ? `[${c.patch}] ` : ""}${c.displayName} (${c.shortName})`,
        value: c.id,
      }))
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

  const name = interaction.options.getString("name", true).trim();
  if (name === "") {
    await interaction.reply({
      content: "name は空にできません。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // Early collision check (avoid wizard for a name that won't work)
  const existing = findStaticByName(interaction.guild.id, name);
  if (existing) {
    await interaction.reply({
      content: `固定「${name}」は既に存在します。 別名を指定してください。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const typeFilter = interaction.options.getString("type");
  const contentId = interaction.options.getString("content");
  const mode = (interaction.options.getString("mode") ?? "standard") as SetupMode;
  const membersInput = interaction.options.getString("members");

  // Wizard mode: launch when content / type missing. members option ignored
  // in wizard (use /static-add later — to be implemented).
  if (!typeFilter || !contentId) {
    const sessionId = randomUUID();
    const state: WizardState = {
      sessionId,
      creatorId: interaction.user.id,
      guildId: interaction.guild.id,
      name,
      type: (typeFilter ?? undefined) as WizardState["type"],
      contentId: contentId ?? undefined,
      mode: undefined,           // wizard always asks
      phaseStrategies: {},
      pendingPhaseIdx: 0,
      createdAt: Date.now(),
    };
    putWizard(state);
    const msg = buildStepMessage(state);
    await interaction.reply({
      embeds: msg.embeds,
      components: msg.components,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // From here on, slash-args path (all options provided up-front).
  // `name` collision + emptiness already validated above.
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
