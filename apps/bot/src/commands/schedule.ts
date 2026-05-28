import {
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { respondContentOrPhase } from "../services/autocomplete";
import { findStaticForChannel } from "../services/static-manager";
import {
  BOOK_WIZARD_PREFIX as _UNUSED_PREFIX,
  DEFAULT_TIME,
  buildBookStepMessage,
  putBookWizard,
  type BookWizardState,
} from "../services/book-wizard";

// Prefix import is for grep/discoverability — actual prefix routing lives in index.ts
void _UNUSED_PREFIX;

export const data = new SlashCommandBuilder()
  .setName("book")
  .setNameLocalizations({ ja: "予定登録" })
  .setDescription("固定活動の予定を登録 (ウィザード形式、 複数日対応)")
  .setDescriptionLocalizations({
    ja: "固定活動の予定を登録 (ウィザード形式、 複数日対応)",
  })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
  // ── Optional metadata; date/time picked via wizard ───────────────────────
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setNameLocalizations({ ja: "通知先" })
      .setDescription("通知先チャネル (省略時は現在のチャネル)")
      .setDescriptionLocalizations({ ja: "通知先チャネル (省略時は現在のチャネル)" })
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  )
  .addStringOption((opt) =>
    opt
      .setName("content")
      .setNameLocalizations({ ja: "コンテンツ" })
      .setDescription("コンテンツID (例: fru、固定 channel なら自動検出)")
      .setDescriptionLocalizations({ ja: "コンテンツID (固定 channel なら自動検出)" })
      .setAutocomplete(true)
      .setMaxLength(40)
  )
  .addStringOption((opt) =>
    opt
      .setName("phase")
      .setNameLocalizations({ ja: "フェーズ" })
      .setDescription("Phase ID (例: p3)")
      .setDescriptionLocalizations({ ja: "フェーズID (例: p3)" })
      .setAutocomplete(true)
      .setMaxLength(40)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("notify_minutes_before")
      .setNameLocalizations({ ja: "通知何分前" })
      .setDescription("何分前に通知するか (default 10)")
      .setDescriptionLocalizations({ ja: "何分前に通知するか (default 10)" })
      .setMinValue(0)
      .setMaxValue(1440)
  )
  .addStringOption((opt) =>
    opt
      .setName("mention")
      .setNameLocalizations({ ja: "メンション" })
      .setDescription("通知時のメンション (例: @here、固定 channel なら role 自動)")
      .setDescriptionLocalizations({
        ja: "通知時のメンション (例: @here、固定 channel なら role 自動)",
      })
      .setMaxLength(200)
  )
  .addStringOption((opt) =>
    opt
      .setName("note")
      .setNameLocalizations({ ja: "メモ" })
      .setDescription("自由文 (例: P3練習)")
      .setDescriptionLocalizations({ ja: "自由文 (例: P3練習)" })
      .setMaxLength(500)
  )
  .addStringOption((opt) =>
    opt
      .setName("chouseisan_url")
      .setNameLocalizations({ ja: "調整さんurl" })
      .setDescription("調整さん等のURL (任意)。通知時に添付される。")
      .setDescriptionLocalizations({ ja: "調整さん等のURL (任意)。通知時に添付。" })
      .setMaxLength(500)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondContentOrPhase(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "このコマンドはサーバー内で実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Where do we post the alert? Falls back to where the command was invoked.
  const targetChannel = interaction.options.getChannel("channel") ?? interaction.channel;
  if (!targetChannel || !("id" in targetChannel)) {
    await interaction.reply({
      content: "通知先チャネルが特定できません。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let contentId = interaction.options.getString("content") ?? undefined;
  const phaseId = interaction.options.getString("phase") ?? undefined;
  const notifyMinutesBefore =
    interaction.options.getInteger("notify_minutes_before") ?? 10;
  let mention = interaction.options.getString("mention") ?? undefined;
  const note = interaction.options.getString("note") ?? undefined;
  const chouseisanUrl = interaction.options.getString("chouseisan_url") ?? undefined;

  if (chouseisanUrl && !isHttpsUrl(chouseisanUrl)) {
    await interaction.reply({
      content: "chouseisan_url は `https://` で始まる URL を指定してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Auto-detect static from the channel where the command was invoked.
  const invokedChannel = interaction.channel;
  const invokedParentId =
    invokedChannel && "parentId" in invokedChannel ? invokedChannel.parentId : null;
  const owningStatic = invokedChannel
    ? findStaticForChannel(interaction.guildId, invokedChannel.id, invokedParentId)
    : null;

  if (owningStatic) {
    if (!contentId) contentId = owningStatic.contentId;
    if (!mention) mention = `<@&${owningStatic.roleId}>`;
  }

  const state: BookWizardState = {
    sessionId: randomUUID(),
    creatorId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: targetChannel.id,
    contentId,
    phaseId,
    mention,
    note,
    chouseisanUrl,
    staticId: owningStatic?.id,
    notifyMinutesBefore,
    weekOffset: 0,
    selectedDates: [],
    defaultTime: DEFAULT_TIME,
    timeByDate: {},
    step: "pickDates",
    createdAt: Date.now(),
  };
  putBookWizard(state);

  const msg = buildBookStepMessage(state, Date.now());
  await interaction.reply({
    embeds: msg.embeds,
    components: msg.components,
    flags: MessageFlags.Ephemeral,
  });
}

function isHttpsUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

/** Kept for /upcoming embed coloring — old export, still imported elsewhere. */
export function isChouseisanUrl(s: string): boolean {
  try {
    return new URL(s).hostname.endsWith("chouseisan.com");
  } catch {
    return false;
  }
}
