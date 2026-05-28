/**
 * /book wizard — pick N candidate dates from a 14-day window, set times
 * (default + per-day override), then create N DB schedules + Discord events.
 *
 * Designed for the "調整さんの返答が出揃った → 候補日 3-5 件を一括登録したい"
 * workflow. Replaces the previous strict-text `/book when:"2025-06-01 21:00"`
 * input that scared off non-technical users.
 *
 * Steps:
 *   1. pickDates: 14 day buttons (toggleable) + default time select + 次へ
 *   2. review:    summary + per-date time edit select + 登録 button
 *   3. editTime:  time select for one specific date (returns to review)
 *
 * State persists in the shared `wizard_sessions` table (kind="book-wizard")
 * so it survives `tsx watch` reloads and bot restarts within the 15min TTL.
 *
 * customId pattern: `book-wizard:<sessionId>:<action>[:<payload>]`
 *   actions:
 *     toggle:<YYYY-MM-DD>     — toggle a date in selectedDates
 *     nav:back / nav:fwd      — shift the 14-day window by ±14 days
 *     default-time (select)   — set defaultTime
 *     edit-date    (select)   — pick a date to edit (→ editTime step)
 *     set-time     (select)   — set time for editingDate (→ back to review)
 *     next                    — go from pickDates to review
 *     back-to-dates           — return to pickDates
 *     back-to-review          — return to review (cancel edit)
 *     reset-time              — drop per-date override (use default again)
 *     create                  — submit
 *     cancel                  — drop session
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type APISelectMenuOption,
} from "discord.js";
import { and, eq, gt, lt } from "drizzle-orm";
import { wizardSessions } from "@ff14kotei/db";
import { getDb } from "../lib/db.js";

export const BOOK_WIZARD_PREFIX = "book-wizard:";
const KIND = "book-wizard";
const TTL_MS = 15 * 60_000;

// ── Constants ───────────────────────────────────────────────────────────────

/** How many days the user sees per page. Capped by ActionRow 5×5 budget. */
export const PAGE_DAYS = 14;

/** Default time used for any date the user didn't override. */
export const DEFAULT_TIME = "21:00";

/** Time options shown in the StringSelect (Discord max 25 — we have 15). */
export const TIME_OPTIONS = [
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
  "21:00", "21:30", "22:00", "22:30", "23:00", "23:30",
  "24:00", "24:30", "25:00", // late-night raid hours (treated as next-day)
] as const;

/** JST = UTC+9. Used for all date math because raids run on Japan time. */
const JST_OFFSET_MS = 9 * 60 * 60_000;
const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

// ── Types ───────────────────────────────────────────────────────────────────

export type BookWizardStep = "pickDates" | "review" | "editTime";

export interface BookWizardState {
  sessionId: string;
  creatorId: string;
  guildId: string;
  channelId: string;

  /** Pre-filled from slash command options or static auto-detection. */
  contentId?: string;
  phaseId?: string;
  mention?: string;
  note?: string;
  chouseisanUrl?: string;
  staticId?: string;
  notifyMinutesBefore: number;

  /**
   * 14-day window offset. 0 = today onwards. +1 = +14 days, -1 = -14 days
   * (clamped so the window never starts before today).
   */
  weekOffset: number;

  /** Selected dates as "YYYY-MM-DD" (JST). Sorted on insert for stable UI. */
  selectedDates: string[];

  /** Time applied to any date that doesn't have an override. */
  defaultTime: string;

  /** Per-date time overrides. Empty means: use defaultTime. */
  timeByDate: Record<string, string>;

  /** When step="editTime", the date currently being edited. */
  editingDate?: string;

  /** Visual state — derived also via the customId, kept here as a hint. */
  step: BookWizardStep;

  createdAt: number;
}

// ── DB-backed session store ─────────────────────────────────────────────────

export function putBookWizard(state: BookWizardState): void {
  prunePeriodically();
  const db = getDb();
  const expiresAt = state.createdAt + TTL_MS;
  db.insert(wizardSessions)
    .values({
      id: state.sessionId,
      kind: KIND,
      creatorId: state.creatorId,
      guildId: state.guildId,
      state: JSON.stringify(state),
      expiresAt,
      createdAt: state.createdAt,
    })
    .onConflictDoUpdate({
      target: wizardSessions.id,
      set: { state: JSON.stringify(state), expiresAt },
    })
    .run();
}

export function getBookWizard(id: string): BookWizardState | null {
  prunePeriodically();
  const db = getDb();
  const row = db
    .select()
    .from(wizardSessions)
    .where(
      and(
        eq(wizardSessions.id, id),
        eq(wizardSessions.kind, KIND),
        gt(wizardSessions.expiresAt, Date.now())
      )
    )
    .get();
  if (!row) return null;
  try {
    return JSON.parse(row.state) as BookWizardState;
  } catch {
    return null;
  }
}

export function deleteBookWizard(id: string): void {
  const db = getDb();
  db.delete(wizardSessions).where(eq(wizardSessions.id, id)).run();
}

/**
 * Atomic read-modify-write under a SQLite transaction. Required for handlers
 * that mutate state: discord.js fires the `interactionCreate` listener
 * concurrently for each click, so a fast tapper can cause two handlers to
 * both read the same pre-update state, both compute "next", and both write
 * — the second write erases the first click's effect (= "the date I just
 * selected disappeared").
 *
 * better-sqlite3 transactions are synchronous, so the read-modify-write
 * runs without giving the event loop a chance to interleave another
 * handler's transaction.
 *
 * Returns the new state, or null if the session is missing/expired.
 */
export function atomicUpdate(
  sessionId: string,
  updater: (state: BookWizardState) => BookWizardState
): BookWizardState | null {
  const db = getDb();
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(wizardSessions)
      .where(
        and(
          eq(wizardSessions.id, sessionId),
          eq(wizardSessions.kind, KIND),
          gt(wizardSessions.expiresAt, Date.now())
        )
      )
      .get();
    if (!row) return null;
    let current: BookWizardState;
    try {
      current = JSON.parse(row.state) as BookWizardState;
    } catch {
      return null;
    }
    const next = updater(current);
    tx.update(wizardSessions)
      .set({ state: JSON.stringify(next) })
      .where(eq(wizardSessions.id, sessionId))
      .run();
    return next;
  });
}

export function clearAllBookWizards(): void {
  const db = getDb();
  db.delete(wizardSessions).where(eq(wizardSessions.kind, KIND)).run();
}

let pruneCounter = 0;
function prunePeriodically(): void {
  pruneCounter++;
  if (pruneCounter % 20 !== 0) return;
  const db = getDb();
  db.delete(wizardSessions).where(lt(wizardSessions.expiresAt, Date.now())).run();
}

export function pruneBookWizardsNow(now: number): void {
  const db = getDb();
  db.delete(wizardSessions).where(lt(wizardSessions.expiresAt, now)).run();
}

// ── Date helpers (JST-aware) ────────────────────────────────────────────────

/**
 * Convert a Unix ms timestamp (UTC) to a JST date string "YYYY-MM-DD".
 * Used everywhere we render dates — guarantees Japan-time anchoring even
 * when the bot runs on a non-Asia/Tokyo server.
 */
export function jstDateKey(unixMs: number): string {
  const shifted = new Date(unixMs + JST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * "5/30 (金)" — short label used on date buttons. Year omitted because the
 * 14-day window can't straddle a year boundary in any meaningful way for
 * Discord button labels (year shown in the embed header instead).
 */
export function shortDateLabel(dateKey: string): string {
  const [yStr, mStr, dStr] = dateKey.split("-");
  const m = Number(mStr);
  const d = Number(dStr);
  const weekday = WEEKDAY_JA[jstWeekday(dateKey)];
  return `${m}/${d} (${weekday})`;
}

/** "2026/5/30 (金)" — long form used in confirm/review embed. */
export function longDateLabel(dateKey: string): string {
  const [yStr, mStr, dStr] = dateKey.split("-");
  return `${yStr}/${Number(mStr)}/${Number(dStr)} (${WEEKDAY_JA[jstWeekday(dateKey)]})`;
}

function jstWeekday(dateKey: string): number {
  // Reconstruct as JST midnight, then ask Date for the weekday.
  const ts = Date.parse(`${dateKey}T00:00:00+09:00`);
  return new Date(ts + JST_OFFSET_MS).getUTCDay();
}

/**
 * Generate `PAGE_DAYS` (14) date keys starting from `now` shifted by
 * `windowOffset` pages of PAGE_DAYS. Clamped so we never produce past dates.
 */
export function pageDates(now: number, windowOffset: number): string[] {
  const startMs = now + windowOffset * PAGE_DAYS * 86_400_000;
  // Clamp to today (in JST) — the user might click ← past the start of today.
  const todayKey = jstDateKey(now);
  const candidates: string[] = [];
  for (let i = 0; i < PAGE_DAYS; i++) {
    const key = jstDateKey(startMs + i * 86_400_000);
    if (key >= todayKey) candidates.push(key);
  }
  // If we ran out (clamped too aggressively), backfill from today.
  while (candidates.length < PAGE_DAYS) {
    const lastKey = candidates[candidates.length - 1] ?? todayKey;
    const next = jstDateKey(Date.parse(`${lastKey}T00:00:00+09:00`) + 86_400_000);
    candidates.push(next);
  }
  return candidates;
}

/**
 * Combine a JST date key + "HH:MM" time into a Unix ms timestamp.
 * Handles late-night raid hours: "24:00" → next day 00:00, "25:30" → +1.5h, etc.
 */
export function combineDateTime(dateKey: string, hhmm: string): number {
  const [hStr, mStr] = hhmm.split(":");
  const hour = Number(hStr);
  const minute = Number(mStr);
  const dayOverflow = Math.floor(hour / 24);
  const realHour = hour % 24;
  const baseMs = Date.parse(`${dateKey}T00:00:00+09:00`);
  return baseMs + dayOverflow * 86_400_000 + realHour * 3_600_000 + minute * 60_000;
}

/** Resolve effective time for a given date (override → default → DEFAULT_TIME). */
export function effectiveTime(state: BookWizardState, dateKey: string): string {
  return state.timeByDate[dateKey] ?? state.defaultTime ?? DEFAULT_TIME;
}

// ── State machine ──────────────────────────────────────────────────────────

export function nextStep(state: BookWizardState): BookWizardStep {
  if (state.step === "editTime" && state.editingDate) return "editTime";
  if (state.step === "review") return "review";
  return "pickDates";
}

// ── customId parsing ────────────────────────────────────────────────────────

export interface ParsedBookWizardAction {
  sessionId: string;
  action: string;
  payload?: string;
}

export function parseBookWizardCustomId(customId: string): ParsedBookWizardAction | null {
  if (!customId.startsWith(BOOK_WIZARD_PREFIX)) return null;
  const rest = customId.slice(BOOK_WIZARD_PREFIX.length);
  const parts = rest.split(":");
  if (parts.length < 2) return null;
  const [sessionId, action, ...tail] = parts;
  if (!sessionId || !action) return null;

  // "nav:back" / "nav:fwd" → action="nav", payload="back"|"fwd"
  // "toggle:2026-05-30" → action="toggle", payload="2026-05-30"
  return { sessionId, action, payload: tail.length > 0 ? tail.join(":") : undefined };
}

// ── State updaters (pure) ───────────────────────────────────────────────────

export function applyToggleDate(state: BookWizardState, dateKey: string): BookWizardState {
  const has = state.selectedDates.includes(dateKey);
  const next = has
    ? state.selectedDates.filter((d) => d !== dateKey)
    : [...state.selectedDates, dateKey].sort();
  // Removing a date also clears its per-date override so timeByDate stays clean.
  const timeByDate = { ...state.timeByDate };
  if (has) delete timeByDate[dateKey];
  return { ...state, selectedDates: next, timeByDate };
}

export function applyNav(state: BookWizardState, dir: "back" | "fwd"): BookWizardState {
  const delta = dir === "fwd" ? 1 : -1;
  // Clamp: weekOffset >= 0 — never browse into the past.
  const next = Math.max(0, state.weekOffset + delta);
  return { ...state, weekOffset: next };
}

export function applyDefaultTime(state: BookWizardState, time: string): BookWizardState {
  return { ...state, defaultTime: time };
}

export function applyNext(state: BookWizardState): BookWizardState {
  return { ...state, step: "review" };
}

export function applyBackToDates(state: BookWizardState): BookWizardState {
  return { ...state, step: "pickDates", editingDate: undefined };
}

export function applyEditDate(state: BookWizardState, dateKey: string): BookWizardState {
  if (!state.selectedDates.includes(dateKey)) return state;
  return { ...state, step: "editTime", editingDate: dateKey };
}

export function applyBackToReview(state: BookWizardState): BookWizardState {
  return { ...state, step: "review", editingDate: undefined };
}

export function applySetTime(state: BookWizardState, time: string): BookWizardState {
  if (!state.editingDate) return state;
  return {
    ...state,
    timeByDate: { ...state.timeByDate, [state.editingDate]: time },
    step: "review",
    editingDate: undefined,
  };
}

export function applyResetTime(state: BookWizardState): BookWizardState {
  if (!state.editingDate) return state;
  const timeByDate = { ...state.timeByDate };
  delete timeByDate[state.editingDate];
  return { ...state, timeByDate, step: "review", editingDate: undefined };
}

// ── UI builders ─────────────────────────────────────────────────────────────

export interface StepMessage {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}

export function buildBookStepMessage(state: BookWizardState, now: number): StepMessage {
  switch (nextStep(state)) {
    case "pickDates": return buildPickDates(state, now);
    case "review":    return buildReview(state);
    case "editTime":  return buildEditTime(state);
  }
}

function headerEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`📅 /book ウィザード`)
    .setColor(0x6e85b7)
    .setDescription(`**${title}**\n${description}`);
}

function buildPickDates(state: BookWizardState, now: number): StepMessage {
  const dates = pageDates(now, state.weekOffset);
  const windowLabel =
    state.weekOffset === 0
      ? `今日 (${shortDateLabel(dates[0])}) から ${PAGE_DAYS} 日間`
      : `+${state.weekOffset * PAGE_DAYS} 日後 (${shortDateLabel(dates[0])} 〜) ${PAGE_DAYS} 日間`;

  const selectedSummary =
    state.selectedDates.length > 0
      ? `**選択中 (${state.selectedDates.length} 件)**: ${state.selectedDates
          .map(shortDateLabel)
          .join(", ")}`
      : "_button をタップして候補日を複数選択してください。_";

  const embed = headerEmbed(
    "候補日を選択 (複数可)",
    [windowLabel, "", selectedSummary, "", "_全日共通の時間を下で選び、 個別に変える場合は次の画面で。_"].join(
      "\n"
    )
  );

  // Mixed-component rows: 3 day-button rows + 1 select row + 1 footer button row.
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  // Day rows first — collect as button-typed locally, then push (variance OK).
  const dayRows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < dates.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const d of dates.slice(i, i + 5)) {
      const selected = state.selectedDates.includes(d);
      // Use setEmoji (separate field) instead of prefixing the label — Discord
      // mobile sometimes "promotes" a leading Unicode symbol to a graphical
      // emoji that eats button width, visually clipping the date text. Keeping
      // emoji + label separated avoids that.
      const btn = new ButtonBuilder()
        .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:toggle:${d}`)
        .setLabel(shortDateLabel(d))
        .setStyle(selected ? ButtonStyle.Success : ButtonStyle.Secondary);
      if (selected) btn.setEmoji("✅");
      row.addComponents(btn);
    }
    dayRows.push(row);
  }

  // Pagination — append to the last day row if it has slack.
  const lastRow = dayRows[dayRows.length - 1];
  if (lastRow.components.length < 5) {
    if (state.weekOffset > 0) {
      lastRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:nav:back`)
          .setLabel(`← ${PAGE_DAYS}日前`)
          .setStyle(ButtonStyle.Secondary)
      );
    }
    if (lastRow.components.length < 5) {
      lastRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:nav:fwd`)
          .setLabel(`${PAGE_DAYS}日後 →`)
          .setStyle(ButtonStyle.Secondary)
      );
    }
  }

  // Now flush day rows + add the time select + footer.
  rows.push(...dayRows);

  // Default time select
  const timeSelect = new StringSelectMenuBuilder()
    .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:default-time`)
    .setPlaceholder(`全日共通の時間 (現在: ${state.defaultTime})`)
    .addOptions(
      TIME_OPTIONS.map<APISelectMenuOption>((t) => ({
        label: t,
        value: t,
        default: t === state.defaultTime,
      }))
    );
  rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(timeSelect));

  // Footer row: 次へ / キャンセル
  const nextDisabled = state.selectedDates.length === 0;
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:next`)
        .setLabel(
          nextDisabled ? "1 件以上選択してください" : `次へ (${state.selectedDates.length} 件) →`
        )
        .setStyle(nextDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(nextDisabled),
      new ButtonBuilder()
        .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:cancel`)
        .setLabel("✖ キャンセル")
        .setStyle(ButtonStyle.Secondary)
    )
  );
  return { embeds: [embed], components: rows };
}

function buildReview(state: BookWizardState): StepMessage {
  const lines: string[] = [];
  for (const d of state.selectedDates) {
    const t = effectiveTime(state, d);
    const overridden = state.timeByDate[d] !== undefined;
    lines.push(`└ **${longDateLabel(d)}** ${t}${overridden ? " 🕐" : ""}`);
  }
  const intro = [
    `${state.selectedDates.length} 件を Discord イベント + bot 通知として登録します。`,
    `🕐 = 個別に時間を変えた日`,
    `デフォルト時間: **${state.defaultTime}**`,
    state.notifyMinutesBefore !== 10
      ? `通知: 開始 ${state.notifyMinutesBefore} 分前`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const embed = headerEmbed("確認", `${intro}\n\n${lines.join("\n")}`);

  // Edit-date select (Discord max 25 options)
  const editSelect = new StringSelectMenuBuilder()
    .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:edit-date`)
    .setPlaceholder("時間を個別に変更したい日付を選択…")
    .addOptions(
      state.selectedDates.slice(0, 25).map<APISelectMenuOption>((d) => ({
        label: `${longDateLabel(d)} — 現在 ${effectiveTime(state, d)}`.slice(0, 100),
        value: d,
      }))
    );

  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(editSelect),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:back-to-dates`)
        .setLabel("← 日付を変更")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:create`)
        .setLabel(`✅ 登録 (${state.selectedDates.length} 件)`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:cancel`)
        .setLabel("✖ キャンセル")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
  return { embeds: [embed], components: rows };
}

function buildEditTime(state: BookWizardState): StepMessage {
  const d = state.editingDate!;
  const current = effectiveTime(state, d);
  const isOverride = state.timeByDate[d] !== undefined;

  const embed = headerEmbed(
    `🕐 時間を編集 — ${longDateLabel(d)}`,
    [
      `現在: **${current}**${isOverride ? " (個別設定)" : ` (デフォルト: ${state.defaultTime})`}`,
      ``,
      `この日の時間を選び直してください。 「デフォルトに戻す」 で個別設定を解除できます。`,
    ].join("\n")
  );

  const timeSelect = new StringSelectMenuBuilder()
    .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:set-time`)
    .setPlaceholder("時間を選択…")
    .addOptions(
      TIME_OPTIONS.map<APISelectMenuOption>((t) => ({
        label: t,
        value: t,
        default: t === current,
      }))
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(timeSelect),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...(isOverride
          ? [
              new ButtonBuilder()
                .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:reset-time`)
                .setLabel("↩ デフォルトに戻す")
                .setStyle(ButtonStyle.Secondary),
            ]
          : []),
        new ButtonBuilder()
          .setCustomId(`${BOOK_WIZARD_PREFIX}${state.sessionId}:back-to-review`)
          .setLabel("← 戻る")
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}
