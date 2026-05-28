import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getAllContents, getContentById } from "../lib/contents";
import { sortByPatch } from "../lib/content-sort";
import { configureContentTypeOption, checkTypeMatch } from "../lib/content-type-choices";

export const data = new SlashCommandBuilder()
  .setName("raid")
  .setNameLocalizations({ ja: "コンテンツ" })
  .setDescription("固定で挑むコンテンツを表示する")
  .setDescriptionLocalizations({ ja: "コンテンツ情報 (Phase一覧・参照URL等) を表示" })
  .addStringOption((opt) => configureContentTypeOption(opt))
  .addStringOption((opt) =>
    opt
      .setName("id")
      .setNameLocalizations({ ja: "コンテンツid" })
      .setDescription("コンテンツID (type で絞り込まれた一覧)")
      .setDescriptionLocalizations({ ja: "コンテンツID (種別で絞られた一覧から選ぶ)" })
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "id") {
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
  const typeFilter = interaction.options.getString("type", true);
  const id = interaction.options.getString("id", true);
  const content = getContentById(id);

  if (!content) {
    await interaction.reply({
      content: `コンテンツが見つかりません: \`${id}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mismatchMsg = checkTypeMatch(content.type, typeFilter, id);
  if (mismatchMsg) {
    await interaction.reply({ content: mismatchMsg, flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${content.displayName} (${content.shortName})`)
    .setDescription(
      [
        `**種別**: ${content.type}`,
        content.patch ? `**実装パッチ**: ${content.patch}` : null,
        `**Phase数**: ${content.phases.length}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .addFields(
      {
        name: "Phase一覧",
        value:
          content.phases.map((p) => `\`${p.id}\` — ${p.name}`).join("\n") || "（なし）",
      },
      ...(content.references.primary
        ? [
            {
              name: "主参照",
              value: content.references.primary,
              inline: true,
            },
          ]
        : [])
    );

  if (content.references.urls.length > 0) {
    // Discord limits embed field.value to 1024 chars. Long URL lists (ucob has
    // 30+ URLs, ~1900 chars) overflow this. Split into multiple fields.
    const chunks = chunkUrlsForFields(content.references.urls);
    embed.addFields(...chunks);
  }

  await interaction.reply({ embeds: [embed] });
}

/**
 * Split a URL list into multiple `{name, value}` field objects so each value
 * stays under Discord's 1024-char field.value limit.
 * Single chunk: name = "参照URL"; multi-chunk: name = "参照URL (1/3)" etc.
 */
export function chunkUrlsForFields(
  urls: string[]
): { name: string; value: string }[] {
  const MAX_VALUE_LEN = 1024;
  const lines = urls.map((u) => `<${u}>`);
  const chunks: string[][] = [[]];

  for (const line of lines) {
    const current = chunks[chunks.length - 1];
    // Length if we add this line to the current chunk (with newline if not empty)
    const joined = current.length === 0 ? line : current.join("\n") + "\n" + line;
    if (joined.length > MAX_VALUE_LEN && current.length > 0) {
      // Start a new chunk
      chunks.push([line]);
    } else {
      current.push(line);
    }
  }

  // Drop trailing empty chunk if the loop never added to it
  while (chunks.length > 1 && chunks[chunks.length - 1].length === 0) chunks.pop();

  const total = chunks.length;
  return chunks.map((c, i) => ({
    name: total === 1 ? "参照URL" : `参照URL (${i + 1}/${total})`,
    value: c.join("\n"),
  }));
}
