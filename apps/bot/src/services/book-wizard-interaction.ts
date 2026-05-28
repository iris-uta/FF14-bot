/**
 * Button + StringSelect handlers for the /book wizard.
 *
 * See ../services/book-wizard.ts for the customId protocol + state machine.
 */
import { randomUUID } from "node:crypto";
import {
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { schedules } from "@ff14kotei/db";
import { getDb } from "../lib/db.js";
import { formatDiscordTime } from "./datetime.js";
import { createScheduledEvents } from "./discord-events.js";
import {
  applyBackToDates,
  applyBackToReview,
  applyDefaultTime,
  applyEditDate,
  applyNav,
  applyNext,
  applyResetTime,
  applySetTime,
  applyToggleDate,
  atomicUpdate,
  buildBookStepMessage,
  combineDateTime,
  deleteBookWizard,
  effectiveTime,
  getBookWizard,
  longDateLabel,
  parseBookWizardCustomId,
  type BookWizardState,
} from "./book-wizard.js";

async function rejectAndAck(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  content: string
): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/** Validate session + creator. Returns null and replies on failure. */
async function preflight(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<BookWizardState | null> {
  const parsed = parseBookWizardCustomId(interaction.customId);
  if (!parsed) {
    await rejectAndAck(interaction, "ボタン ID が不正です。");
    return null;
  }
  const state = getBookWizard(parsed.sessionId);
  if (!state) {
    await rejectAndAck(
      interaction,
      "セッションが期限切れです (15 分)。 `/book` から再度実行してください。"
    );
    return null;
  }
  if (interaction.user.id !== state.creatorId) {
    await rejectAndAck(interaction, "このウィザードを操作できるのは開始した人のみです。");
    return null;
  }
  return state;
}

// ── Button handler ──────────────────────────────────────────────────────────

export async function handleBookWizardButton(interaction: ButtonInteraction): Promise<void> {
  const state = await preflight(interaction);
  if (!state) return;
  const parsed = parseBookWizardCustomId(interaction.customId)!;

  // Mutating actions go through atomicUpdate so concurrent clicks (fast tapper)
  // can't race a read+write and lose each other's effect.
  const mutate = (updater: (s: BookWizardState) => BookWizardState) =>
    atomicUpdate(parsed.sessionId, updater);

  switch (parsed.action) {
    case "toggle": {
      if (!parsed.payload) return rejectAndAck(interaction, "日付が空です。");
      const payload = parsed.payload;
      const next = mutate((s) => applyToggleDate(s, payload));
      if (!next) return rejectAndAck(interaction, "セッションが失効しました。");
      const msg = buildBookStepMessage(next, Date.now());
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    case "nav": {
      if (parsed.payload !== "back" && parsed.payload !== "fwd") {
        return rejectAndAck(interaction, "nav payload が不正です。");
      }
      const dir = parsed.payload;
      const next = mutate((s) => applyNav(s, dir));
      if (!next) return rejectAndAck(interaction, "セッションが失効しました。");
      const msg = buildBookStepMessage(next, Date.now());
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    case "next": {
      const next = mutate((s) => (s.selectedDates.length === 0 ? s : applyNext(s)));
      if (!next) return rejectAndAck(interaction, "セッションが失効しました。");
      if (next.selectedDates.length === 0) {
        return rejectAndAck(interaction, "日付を 1 件以上選んでください。");
      }
      const msg = buildBookStepMessage(next, Date.now());
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    case "back-to-dates": {
      const next = mutate(applyBackToDates);
      if (!next) return rejectAndAck(interaction, "セッションが失効しました。");
      const msg = buildBookStepMessage(next, Date.now());
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    case "back-to-review": {
      const next = mutate(applyBackToReview);
      if (!next) return rejectAndAck(interaction, "セッションが失効しました。");
      const msg = buildBookStepMessage(next, Date.now());
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    case "reset-time": {
      const next = mutate(applyResetTime);
      if (!next) return rejectAndAck(interaction, "セッションが失効しました。");
      const msg = buildBookStepMessage(next, Date.now());
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    case "create": {
      await runCreate(interaction, state);
      return;
    }
    case "cancel": {
      deleteBookWizard(state.sessionId);
      const embed = new EmbedBuilder()
        .setTitle("✖ キャンセルしました")
        .setColor(0x8a8a8a)
        .setDescription("予定登録は中止されました。");
      await interaction.update({ embeds: [embed], components: [] });
      return;
    }
    default:
      return rejectAndAck(interaction, `未対応の action: ${parsed.action}`);
  }
}

// ── StringSelect handler ────────────────────────────────────────────────────

export async function handleBookWizardSelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  const state = await preflight(interaction);
  if (!state) return;
  const parsed = parseBookWizardCustomId(interaction.customId)!;
  const value = interaction.values[0];
  if (!value) return rejectAndAck(interaction, "選択値が空です。");

  const mutate = (updater: (s: BookWizardState) => BookWizardState) =>
    atomicUpdate(parsed.sessionId, updater);

  switch (parsed.action) {
    case "default-time": {
      const next = mutate((s) => applyDefaultTime(s, value));
      if (!next) return rejectAndAck(interaction, "セッションが失効しました。");
      const msg = buildBookStepMessage(next, Date.now());
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    case "edit-date": {
      const next = mutate((s) => applyEditDate(s, value));
      if (!next) return rejectAndAck(interaction, "セッションが失効しました。");
      const msg = buildBookStepMessage(next, Date.now());
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    case "set-time": {
      const next = mutate((s) => applySetTime(s, value));
      if (!next) return rejectAndAck(interaction, "セッションが失効しました。");
      const msg = buildBookStepMessage(next, Date.now());
      await interaction.update({ embeds: msg.embeds, components: msg.components });
      return;
    }
    default:
      return rejectAndAck(interaction, `未対応の select action: ${parsed.action}`);
  }
}

// ── Create handler ──────────────────────────────────────────────────────────

async function runCreate(
  interaction: ButtonInteraction,
  state: BookWizardState
): Promise<void> {
  if (!interaction.guild) {
    await interaction.update({
      content: "❌ サーバー情報が取得できません。",
      embeds: [],
      components: [],
    });
    return;
  }

  // Show progress while we hit Discord API + DB
  const progress = new EmbedBuilder()
    .setTitle("⏳ 登録中…")
    .setColor(0x6e85b7)
    .setDescription(
      `${state.selectedDates.length} 件の予定を作成中。 Discord events + bot 通知を準備中…`
    );
  await interaction.update({ embeds: [progress], components: [] });

  // 1) Insert DB schedules + remember start times for the event-create pass.
  const db = getDb();
  const now = Date.now();
  const rows: { id: string; startsAt: number; time: string; dateKey: string }[] = [];

  for (const dateKey of state.selectedDates) {
    const time = effectiveTime(state, dateKey);
    const startsAt = combineDateTime(dateKey, time);
    if (startsAt <= now) {
      // skip past-due (e.g. user picked today but the time already passed)
      continue;
    }
    const id = randomUUID();
    db.insert(schedules)
      .values({
        id,
        guildId: state.guildId,
        channelId: state.channelId,
        contentId: state.contentId ?? null,
        phaseId: state.phaseId ?? null,
        startsAt,
        notifyMinutesBefore: state.notifyMinutesBefore,
        mention: state.mention ?? null,
        note: state.note ?? null,
        chouseisanUrl: state.chouseisanUrl ?? null,
        staticId: state.staticId ?? null,
        createdAt: now,
        createdBy: state.creatorId,
      })
      .run();
    rows.push({ id, startsAt, time, dateKey });
  }

  if (rows.length === 0) {
    deleteBookWizard(state.sessionId);
    const failed = new EmbedBuilder()
      .setTitle("⚠ 登録できる予定がありません")
      .setColor(0xf59e0b)
      .setDescription(
        "選択した日時はすべて過去でした。 再度 `/book` から登録してください。"
      );
    await interaction.editReply({ embeds: [failed], components: [] });
    return;
  }

  // 2) Best-effort: also create Discord native scheduled events
  const eventName = state.note
    ? `固定: ${state.note}`.slice(0, 90)
    : `固定活動${state.contentId ? ` (${state.contentId})` : ""}`;
  const eventResults = await createScheduledEvents(
    interaction.guild,
    rows.map((r) => ({
      name: eventName,
      startsAt: r.startsAt,
      description: state.note ?? undefined,
    }))
  );
  const eventOkCount = eventResults.filter((r) => r.ok).length;
  const eventFailExample = eventResults.find((r) => !r.ok)?.error;

  // 3) Done embed
  deleteBookWizard(state.sessionId);
  const lines: string[] = [
    `**${rows.length} 件の予定を登録しました。**`,
    "",
    ...rows.map(
      (r) => `└ ${longDateLabel(r.dateKey)} ${r.time} — ${formatDiscordTime(r.startsAt, "R")}`
    ),
    "",
    `📣 通知先: <#${state.channelId}>`,
    `⏰ 開始 ${state.notifyMinutesBefore} 分前に bot から通知 + ${eventOkCount}/${rows.length} 件を Discord イベントに登録${eventFailExample ? ` (一部失敗: ${eventFailExample.slice(0, 80)})` : ""}`,
  ];
  if (state.chouseisanUrl) lines.push(`🔗 調整さん: ${state.chouseisanUrl}`);

  const done = new EmbedBuilder()
    .setTitle("✅ 予定登録完了")
    .setColor(0x2ecc71)
    .setDescription(lines.join("\n").slice(0, 4096));
  await interaction.editReply({ embeds: [done], components: [] });
}
