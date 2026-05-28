/**
 * /dev-test — bulk-create / cleanup test statics for every content.
 *
 * Use cases:
 *   - Verify channel-creation works end-to-end across all 30 contents
 *   - Eyeball how mass-setup looks in a test guild
 *   - Quickly reset a test guild
 *
 * Restrictions:
 *   - Administrator permission only (won't show up in non-admin slash menus)
 *   - Always ephemeral (output never leaks to channel)
 *   - All test statics use the `[dev-test]` name prefix so cleanup is precise
 *
 * Discord limits to be aware of:
 *   - 500 channels per guild (categories count)
 *   - 50 channels per category
 *   - 250 roles per guild
 * 30 contents × (1 category + ~3 channels) ≈ 120 channels; well under 500.
 */
import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type CategoryChannel,
} from "discord.js";
import { eq } from "drizzle-orm";
import { statics, staticSlots, staticMembers } from "@ff14kotei/db";
import { getDb } from "../lib/db";
import { getAllContents } from "../lib/contents";
import { findStaticByName, initStatic } from "../services/static-manager";
import { listStaticsInGuild } from "../services/static-info";

const TEST_PREFIX = "[dev-test]";

export const data = new SlashCommandBuilder()
  .setName("dev-test")
  .setNameLocalizations({ ja: "開発テスト" })
  .setDescription("(管理者用) 全コンテンツの channel を一括作成 or cleanup")
  .setDescriptionLocalizations({ ja: "(管理者用) 全コンテンツの channel を一括作成 or cleanup" })
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setNameLocalizations({ ja: "作成" })
      .setDescription("全コンテンツに対して [dev-test] static を minimal mode で一括作成")
      .setDescriptionLocalizations({ ja: "全コンテンツに対して [dev-test] static を minimal mode で一括作成" })
      .addStringOption((opt) =>
        opt
          .setName("filter")
          .setNameLocalizations({ ja: "絞り込み" })
          .setDescription("type ('ultimate' 等) or id 部分一致で絞る (例: 'm9' で m9s のみ)")
          .setDescriptionLocalizations({ ja: "type or id 部分一致 (例: 'ultimate' / 'm9')" })
          .setMaxLength(40)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("cleanup")
      .setNameLocalizations({ ja: "削除" })
      .setDescription("このサーバーの [dev-test] static + channel + role を全削除")
      .setDescriptionLocalizations({ ja: "このサーバーの [dev-test] static + channel + role を全削除" })
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setNameLocalizations({ ja: "一覧" })
      .setDescription("このサーバーの [dev-test] static を一覧表示")
      .setDescriptionLocalizations({ ja: "このサーバーの [dev-test] static を一覧表示" })
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: "このコマンドはサーバー内で実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand(true);
  if (sub === "create") return handleCreate(interaction);
  if (sub === "cleanup") return handleCleanup(interaction);
  if (sub === "list") return handleList(interaction);
  await interaction.reply({
    content: `Unknown subcommand: ${sub}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCreate(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const filter = interaction.options.getString("filter")?.toLowerCase().trim();
  let contents = getAllContents();
  if (filter) {
    contents = contents.filter(
      (c) =>
        c.id.toLowerCase().includes(filter) ||
        c.type.toLowerCase().includes(filter) ||
        c.shortName.toLowerCase().includes(filter)
    );
  }

  if (contents.length === 0) {
    await interaction.editReply(
      `絞り込み条件 \`${filter}\` にマッチするコンテンツがありません。`
    );
    return;
  }

  // Discord safety check: estimate channel count.
  // Cap at 50 contents for safety (≈150 channels, well under guild 500 limit).
  const SAFE_LIMIT = 50;
  if (contents.length > SAFE_LIMIT) {
    await interaction.editReply(
      `⚠️ ${contents.length} contents = 約 ${contents.length * 3} channels を作成しようとしています。\n` +
        `安全のため上限 ${SAFE_LIMIT} contents に制限しています。 \`filter:\` オプションで絞り込んでください。\n` +
        `(例: \`/dev-test create filter:ultimate\` で絶のみ、 \`filter:m\` で零式のみ)`
    );
    return;
  }

  const results: string[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (const c of contents) {
    const name = `${TEST_PREFIX} ${c.id}`;
    if (findStaticByName(guild.id, name)) {
      results.push(`⏭️  ${c.id}`);
      skipped++;
      continue;
    }
    try {
      await initStatic({
        guild,
        leaderId: interaction.user.id,
        name,
        content: c,
        mode: "minimal",
      });
      results.push(`✅ ${c.id}`);
      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push(`❌ ${c.id}: ${msg.slice(0, 60)}`);
      failed++;
    }

    // Progress update every 5 (avoid Discord rate limit on editReply)
    if (results.length % 5 === 0 && results.length < contents.length) {
      await interaction.editReply(
        `**進捗 ${results.length}/${contents.length}** (✅${created} ⏭️${skipped} ❌${failed})\n${truncate(results.join("\n"), 1700)}`
      );
    }
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  await interaction.editReply(
    `**完了 (${elapsed}s)**: ✅${created} 作成 / ⏭️${skipped} スキップ済 / ❌${failed} 失敗\n${truncate(results.join("\n"), 1800)}`
  );
}

async function handleCleanup(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const testStatics = listStaticsInGuild(guild.id).filter((s) =>
    s.name.startsWith(TEST_PREFIX)
  );

  if (testStatics.length === 0) {
    await interaction.editReply("削除対象の [dev-test] static はありません。");
    return;
  }

  const results: string[] = [];
  let removed = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (const s of testStatics) {
    try {
      await deleteStaticAndChannels(guild, s.id, s.categoryId, s.roleId);
      results.push(`🗑️  ${s.name}`);
      removed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push(`❌ ${s.name}: ${msg.slice(0, 60)}`);
      failed++;
    }

    if (results.length % 5 === 0 && results.length < testStatics.length) {
      await interaction.editReply(
        `**進捗 ${results.length}/${testStatics.length}** (🗑️${removed} ❌${failed})\n${truncate(results.join("\n"), 1700)}`
      );
    }
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  await interaction.editReply(
    `**Cleanup 完了 (${elapsed}s)**: 🗑️${removed} 削除 / ❌${failed} 失敗\n${truncate(results.join("\n"), 1800)}`
  );
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  const testStatics = listStaticsInGuild(guild.id).filter((s) =>
    s.name.startsWith(TEST_PREFIX)
  );

  if (testStatics.length === 0) {
    await interaction.reply({
      content: "[dev-test] static は存在しません。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = testStatics.map((s) => `▸ ${s.name} (\`${s.id.slice(0, 8)}\`)`);
  await interaction.reply({
    content: `**[dev-test] static 一覧 (${testStatics.length})**:\n${truncate(lines.join("\n"), 1800)}`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Delete the category + all children + role + DB rows for a static.
 * Each step is best-effort: a failure on one resource doesn't block the others.
 */
async function deleteStaticAndChannels(
  guild: Guild,
  staticId: string,
  categoryId: string,
  roleId: string
): Promise<void> {
  // 1. Delete category children first
  const children = guild.channels.cache.filter(
    (c) => "parentId" in c && c.parentId === categoryId
  );
  for (const child of children.values()) {
    try {
      await child.delete("dev-test cleanup");
    } catch (err) {
      console.warn(`dev-test cleanup: failed to delete child ${child.id}:`, err);
    }
  }
  // 2. Delete the category itself
  try {
    const cat = (await guild.channels.fetch(categoryId)) as CategoryChannel | null;
    if (cat) await cat.delete("dev-test cleanup");
  } catch (err) {
    console.warn(`dev-test cleanup: failed to delete category ${categoryId}:`, err);
  }
  // 3. Delete the role
  try {
    const role = await guild.roles.fetch(roleId);
    if (role) await role.delete("dev-test cleanup");
  } catch (err) {
    console.warn(`dev-test cleanup: failed to delete role ${roleId}:`, err);
  }
  // 4. Delete DB rows (always, even if Discord ops failed — keep DB consistent with intent)
  const db = getDb();
  db.delete(staticSlots).where(eq(staticSlots.staticId, staticId)).run();
  db.delete(staticMembers).where(eq(staticMembers.staticId, staticId)).run();
  db.delete(statics).where(eq(statics.id, staticId)).run();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 20) + "\n...(省略)";
}
