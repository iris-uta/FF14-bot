import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type Guild,
  type CategoryChannel,
} from "discord.js";
import { getAllContents, getContentById } from "../lib/contents";
import { buildChannelPlan, type ChannelPlan } from "../services/channel-setup";

export const data = new SlashCommandBuilder()
  .setName("setup-static")
  .setDescription("コンテンツのカテゴリ + Phase チャネルを一括作成")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addStringOption((opt) =>
    opt
      .setName("content")
      .setDescription("コンテンツID（autocomplete対応）")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("固定の名前 (省略時はコンテンツ名)")
      .setMaxLength(80)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const matches = getAllContents()
    .filter(
      (c) =>
        c.id.toLowerCase().includes(focused) ||
        c.displayName.toLowerCase().includes(focused) ||
        c.shortName.toLowerCase().includes(focused)
    )
    .slice(0, 25)
    .map((c) => ({ name: `${c.displayName} (${c.shortName})`, value: c.id }));
  await interaction.respond(matches);
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
  const partyName = interaction.options.getString("name") ?? undefined;

  const content = getContentById(contentId);
  if (!content) {
    await interaction.reply({
      content: `コンテンツが見つかりません: \`${contentId}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const plan = buildChannelPlan(content, { partyName });

  const existing = interaction.guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === plan.categoryName
  );
  if (existing) {
    await interaction.reply({
      content: `カテゴリ「${plan.categoryName}」は既に存在します（<#${existing.id}>）。別の名前を \`name\` オプションで指定してください。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();
  try {
    const { category, created } = await applyPlan(interaction.guild, plan);
    await interaction.editReply({
      content: [
        `✅ **${content.displayName}** 用のチャネルを作成しました。`,
        `**カテゴリ**: ${category.name}`,
        `**Phaseチャネル** (${created.length}件):`,
        ...created.map((c) => `  • <#${c.id}>`),
      ].join("\n"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("setup-static failed:", err);
    await interaction.editReply({
      content: [
        "❌ チャネル作成に失敗しました。",
        "Bot に **Manage Channels** 権限があるか確認してください。",
        `エラー: \`${message}\``,
      ].join("\n"),
    });
  }
}

interface ApplyResult {
  category: CategoryChannel;
  created: { id: string; name: string; phaseId: string }[];
}

async function applyPlan(guild: Guild, plan: ChannelPlan): Promise<ApplyResult> {
  const category = (await guild.channels.create({
    name: plan.categoryName,
    type: ChannelType.GuildCategory,
  })) as CategoryChannel;

  const created: ApplyResult["created"] = [];
  for (const spec of plan.channels) {
    const channel = await guild.channels.create({
      name: spec.name,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: spec.topic || undefined,
    });
    created.push({ id: channel.id, name: channel.name, phaseId: spec.phaseId });
  }
  return { category, created };
}
