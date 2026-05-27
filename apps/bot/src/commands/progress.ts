import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import {
  PROGRESS_STATUSES,
  type ProgressStatus,
  createProgressLog,
  listProgressLogsForStatic,
  renderProgressTimeline,
  buildTwitterSummary,
  getProgressLog,
  deleteProgressLog,
  isValidProgressStatus,
} from "../services/progress";
import { findStaticByName, findStaticForChannel } from "../services/static-manager";
import { listStaticsInGuild } from "../services/static-info";
import { parseJstDateTime } from "../services/datetime";
import { getContentById } from "../lib/contents";

const STATUS_CHOICES: { name: string; name_localizations: { ja: string }; value: ProgressStatus }[] = [
  { name: "reached", name_localizations: { ja: "到達" }, value: "reached" },
  { name: "cleared", name_localizations: { ja: "撃破" }, value: "cleared" },
  { name: "first-clear", name_localizations: { ja: "初見クリア" }, value: "first-clear" },
  { name: "note", name_localizations: { ja: "メモ" }, value: "note" },
];

export const data = new SlashCommandBuilder()
  .setName("progress")
  .setNameLocalizations({ ja: "進行記録" })
  .setDescription("固定の進行マイルストーンを記録 / 表示")
  .setDescriptionLocalizations({ ja: "固定の進行マイルストーンを記録 / 表示" })
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
  .addSubcommand((sub) =>
    sub
      .setName("mark")
      .setNameLocalizations({ ja: "記録" })
      .setDescription("マイルストーン (到達/撃破/初見クリア/メモ) を記録")
      .setDescriptionLocalizations({ ja: "マイルストーン (到達/撃破/初見クリア/メモ) を記録" })
      .addStringOption((opt) => {
        const o = opt
          .setName("status")
          .setNameLocalizations({ ja: "種別" })
          .setDescription("マイルストーン種別")
          .setDescriptionLocalizations({ ja: "マイルストーン種別" })
          .setRequired(true);
        for (const c of STATUS_CHOICES) {
          o.addChoices({ name: c.name, name_localizations: c.name_localizations, value: c.value });
        }
        return o;
      })
      .addStringOption((opt) =>
        opt
          .setName("phase")
          .setNameLocalizations({ ja: "フェーズ" })
          .setDescription("Phase ID (例: p3、note 種別なら省略可)")
          .setDescriptionLocalizations({ ja: "Phase ID (例: p3、note 種別なら省略可)" })
          .setAutocomplete(true)
          .setMaxLength(40)
      )
      .addStringOption((opt) =>
        opt
          .setName("note")
          .setNameLocalizations({ ja: "メモ" })
          .setDescription("自由文 (例: 1%安定、開幕事故0)")
          .setDescriptionLocalizations({ ja: "自由文 (例: 1%安定、開幕事故0)" })
          .setMaxLength(200)
      )
      .addStringOption((opt) =>
        opt
          .setName("date")
          .setNameLocalizations({ ja: "日付" })
          .setDescription("いつの出来事か (JST、省略時は今、例: 2026-05-20)")
          .setDescriptionLocalizations({ ja: "いつの出来事か (JST、省略時は今、例: 2026-05-20)" })
          .setMaxLength(40)
      )
      .addStringOption((opt) =>
        opt
          .setName("static")
          .setNameLocalizations({ ja: "固定名" })
          .setDescription("固定名 (省略時は現在 channel から自動検出)")
          .setDescriptionLocalizations({ ja: "固定名 (省略時は現在 channel から自動検出)" })
          .setAutocomplete(true)
          .setMaxLength(80)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("show")
      .setNameLocalizations({ ja: "表示" })
      .setDescription("進行 timeline を embed 表示")
      .setDescriptionLocalizations({ ja: "進行 timeline を embed 表示" })
      .addStringOption((opt) =>
        opt
          .setName("static")
          .setNameLocalizations({ ja: "固定名" })
          .setDescription("固定名 (省略時は現在 channel から自動検出)")
          .setDescriptionLocalizations({ ja: "固定名 (省略時は現在 channel から自動検出)" })
          .setAutocomplete(true)
          .setMaxLength(80)
      )
      .addBooleanOption((opt) =>
        opt
          .setName("public")
          .setNameLocalizations({ ja: "公開投稿" })
          .setDescription("true なら channel に投稿 (default: ephemeral)")
          .setDescriptionLocalizations({ ja: "true なら channel に投稿 (default: ephemeral)" })
      )
      .addBooleanOption((opt) =>
        opt
          .setName("twitter")
          .setNameLocalizations({ ja: "ツイッター用" })
          .setDescription("Twitter シェア用の plain text サマリも出す")
          .setDescriptionLocalizations({ ja: "Twitter シェア用の plain text サマリも出す" })
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setNameLocalizations({ ja: "削除" })
      .setDescription("記録を削除 (作成者のみ)")
      .setDescriptionLocalizations({ ja: "記録を削除 (作成者のみ)" })
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("削除する log ID")
          .setRequired(true)
          .setMaxLength(40)
      )
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused(true);
  if (focused.name === "static") {
    const list = listStaticsInGuild(interaction.guildId)
      .filter((s) => s.name.toLowerCase().includes(focused.value.toLowerCase()))
      .slice(0, 25)
      .map((s) => ({ name: s.name.slice(0, 100), value: s.name.slice(0, 100) }));
    await interaction.respond(list);
    return;
  }
  if (focused.name === "phase") {
    // Resolve target static to get its content's phases
    const target = resolveStaticForInteraction(interaction);
    if (!target) {
      await interaction.respond([]);
      return;
    }
    const content = getContentById(target.contentId);
    if (!content) {
      await interaction.respond([]);
      return;
    }
    const q = focused.value.toLowerCase();
    const choices = content.phases
      .filter((p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 25)
      .map((p) => ({ name: `${p.id} — ${p.name}`.slice(0, 100), value: p.id }));
    await interaction.respond(choices);
    return;
  }
  await interaction.respond([]);
}

function resolveStaticForInteraction(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction
) {
  if (!interaction.guildId) return null;
  const nameOpt = interaction.options.getString("static");
  if (nameOpt) return findStaticByName(interaction.guildId, nameOpt);
  const channel = interaction.channel;
  if (!channel) return null;
  const parentId = "parentId" in channel ? channel.parentId : null;
  return findStaticForChannel(interaction.guildId, channel.id, parentId);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "このコマンドはサーバー内で実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const sub = interaction.options.getSubcommand(true);
  if (sub === "mark") return handleMark(interaction);
  if (sub === "show") return handleShow(interaction);
  if (sub === "remove") return handleRemove(interaction);
  await interaction.reply({ content: `Unknown subcommand: ${sub}`, flags: MessageFlags.Ephemeral });
}

async function handleMark(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = resolveStaticForInteraction(interaction);
  if (!target) {
    await interaction.reply({
      content: "固定が特定できません。`static:<固定名>` で明示するか、固定 channel から実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const statusRaw = interaction.options.getString("status", true);
  if (!isValidProgressStatus(statusRaw)) {
    await interaction.reply({
      content: `不正な status: ${statusRaw} (許容: ${PROGRESS_STATUSES.join("/")})`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const phaseId = interaction.options.getString("phase");
  const note = interaction.options.getString("note");
  const dateInput = interaction.options.getString("date");

  // phase は note 以外で必須
  if (statusRaw !== "note" && !phaseId) {
    await interaction.reply({
      content: `\`status:${statusRaw}\` の場合は \`phase\` も必要です (note 種別なら省略可)。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let loggedAt = Date.now();
  if (dateInput) {
    // Accept date-only ("2026-05-20") or full datetime
    const withTime = /\d{2}:\d{2}/.test(dateInput) ? dateInput : `${dateInput} 00:00`;
    const parsed = parseJstDateTime(withTime);
    if (parsed === null) {
      await interaction.reply({
        content: `日付の形式が不正です: \`${dateInput}\` (例: \`2026-05-20\`)`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    loggedAt = parsed;
  }

  const id = randomUUID();
  createProgressLog({
    id,
    staticId: target.id,
    guildId: target.guildId,
    userId: interaction.user.id,
    phaseId,
    status: statusRaw,
    note,
    loggedAt,
  });

  await interaction.reply({
    content: `📝 記録しました: \`${id.slice(0, 8)}\` — ${target.name} / ${phaseId ?? "(phase なし)"} / ${statusRaw}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleShow(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = resolveStaticForInteraction(interaction);
  if (!target) {
    await interaction.reply({
      content: "固定が特定できません。`static:<固定名>` で明示するか、固定 channel から実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const logs = listProgressLogsForStatic(target.id);
  const embed = renderProgressTimeline(target.name, logs);
  const isPublic = interaction.options.getBoolean("public") ?? false;
  const wantTwitter = interaction.options.getBoolean("twitter") ?? false;

  const reply: { embeds: [typeof embed]; content?: string; flags?: number } = { embeds: [embed] };
  if (wantTwitter && logs.length > 0) {
    reply.content = "```\n" + buildTwitterSummary(target.name, logs) + "\n```";
  }
  if (!isPublic) reply.flags = MessageFlags.Ephemeral;
  await interaction.reply(reply);
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getString("id", true);
  const log = getProgressLog(id);
  if (!log || log.guildId !== interaction.guildId) {
    await interaction.reply({
      content: `記録が見つかりません: \`${id}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (log.userId !== interaction.user.id) {
    await interaction.reply({
      content: "削除できるのは記録の作成者のみです。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  deleteProgressLog(id);
  await interaction.reply({
    content: `🗑️ 削除しました: \`${id.slice(0, 8)}\``,
    flags: MessageFlags.Ephemeral,
  });
}
