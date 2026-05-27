import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { and, eq, gt } from "drizzle-orm";
import { schedules } from "@ff14kotei/db";
import { getDb } from "../lib/db";

export const data = new SlashCommandBuilder()
  .setName("unschedule")
  .setNameLocalizations({ ja: "予定削除" })
  .setDescription("登録済みの予定を取り消す")
  .setDescriptionLocalizations({ ja: "登録済みの固定予定を取り消す" })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
  .addStringOption((opt) =>
    opt
      .setName("id")
      .setNameLocalizations({ ja: "予定id" })
      .setDescription("予定 ID (autocomplete対応)")
      .setDescriptionLocalizations({ ja: "予定ID (autocomplete で選択可能)" })
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const now = Date.now();
  const db = getDb();
  const rows = db
    .select()
    .from(schedules)
    .where(and(eq(schedules.guildId, interaction.guildId), gt(schedules.startsAt, now)))
    .limit(25)
    .all();

  const matches = rows
    .filter((r) => r.id.toLowerCase().includes(focused) || (r.note ?? "").toLowerCase().includes(focused))
    .slice(0, 25)
    .map((r) => {
      const dateLabel = new Date(r.startsAt).toISOString().slice(0, 16).replace("T", " ");
      const label = `${dateLabel} ${r.note ? `— ${r.note}` : ""}`.slice(0, 100);
      return { name: label, value: r.id };
    });
  await interaction.respond(matches);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "このコマンドはサーバー内で実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const id = interaction.options.getString("id", true);
  const db = getDb();
  const existing = db
    .select()
    .from(schedules)
    .where(and(eq(schedules.id, id), eq(schedules.guildId, interaction.guildId)))
    .get();

  if (!existing) {
    await interaction.reply({
      content: `予定が見つかりません: \`${id}\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  db.delete(schedules).where(eq(schedules.id, id)).run();

  await interaction.reply({
    content: `🗑️ 予定 \`${id}\` を削除しました。`,
    flags: MessageFlags.Ephemeral,
  });
}
