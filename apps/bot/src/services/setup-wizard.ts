/**
 * /setup button wizard — state machine for interactive setup.
 *
 * Steps:
 *   1. pickType:     user picks content type (絶 / 零式 / etc)
 *   2. pickContent:  user picks specific content (e.g., FRU)
 *   3. pickMode:     user picks setup mode (標準 / 早期攻略 / 最小)
 *   4. pickStrategy: for each phase with >=2 strategies, user picks one
 *                    (popular: true marked + selected by default)
 *   5. confirm:      summary + 作成 / キャンセル buttons
 *   6. done:         creates static, replaces UI with success message
 *
 * State persisted in-memory (15min TTL). customId pattern:
 *   `setup-wizard:<sessionId>:<step>`
 * Click value encoded in either button suffix or StringSelect.values.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type APIInteractionGuildMember,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type GuildMember,
  type MessageFlags,
} from "discord.js";
import type { Content, ContentType, StrategyVariant } from "@ff14kotei/schema";
import { getAllContents } from "../lib/contents.js";
import { CONTENT_TYPE_CHOICES } from "../lib/content-type-choices.js";
import { sortByPatch } from "../lib/content-sort.js";

export const WIZARD_PREFIX = "setup-wizard:";

export type WizardStep =
  | "pickType"
  | "pickContent"
  | "pickMode"
  | "pickStrategy"
  | "confirm"
  | "done";

export interface WizardState {
  /** ID used in customIds and the in-memory key */
  sessionId: string;
  /** Who started the wizard — only this user can advance it */
  creatorId: string;
  guildId: string;

  /** Mandatory args provided up-front via slash */
  name: string;

  /** Filled in as the user advances */
  type?: ContentType;
  contentId?: string;
  mode?: "standard" | "race" | "minimal";

  /** Per-phase strategy choice. key = phase.id, value = strategy.id */
  phaseStrategies: Record<string, string>;

  /** Index of the next multi-strategy phase to ask about (during pickStrategy loop) */
  pendingPhaseIdx: number;

  /** Wall clock for TTL eviction */
  createdAt: number;
}

// ── DB-backed session store (15min TTL, survives bot restarts) ──────────────
//
// Why DB instead of Map: `tsx watch` reloads on file changes, wiping in-memory
// state and triggering "session expired" mid-wizard. SQLite handles it.

import { and, eq, gt, lt } from "drizzle-orm";
import { wizardSessions } from "@ff14kotei/db";
import { getDb } from "../lib/db.js";

const TTL_MS = 15 * 60_000;
const KIND = "setup-wizard";

export function putWizard(state: WizardState): void {
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
      set: {
        state: JSON.stringify(state),
        expiresAt,
      },
    })
    .run();
}

export function getWizard(id: string): WizardState | null {
  prunePeriodically();
  const db = getDb();
  const now = Date.now();
  const row = db
    .select()
    .from(wizardSessions)
    .where(
      and(
        eq(wizardSessions.id, id),
        eq(wizardSessions.kind, KIND),
        gt(wizardSessions.expiresAt, now)
      )
    )
    .get();
  if (!row) return null;
  try {
    return JSON.parse(row.state) as WizardState;
  } catch {
    return null;
  }
}

export function deleteWizard(id: string): void {
  const db = getDb();
  db.delete(wizardSessions).where(eq(wizardSessions.id, id)).run();
}

export function clearAllWizards(): void {
  const db = getDb();
  db.delete(wizardSessions).where(eq(wizardSessions.kind, KIND)).run();
}

// Lazy prune — every ~1/20 call we delete expired rows. Avoids a worker.
let pruneCounter = 0;
function prunePeriodically(): void {
  pruneCounter++;
  if (pruneCounter % 20 !== 0) return;
  const db = getDb();
  db.delete(wizardSessions).where(lt(wizardSessions.expiresAt, Date.now())).run();
}

/** Test-only export. Forces an immediate prune (no counter check). */
export function pruneNow(now: number): void {
  const db = getDb();
  db.delete(wizardSessions).where(lt(wizardSessions.expiresAt, now)).run();
}

// ── State machine: which step is next? ──────────────────────────────────────

/**
 * Given a state, return which step the UI should show next.
 *  - missing type → pickType
 *  - missing content → pickContent
 *  - missing mode → pickMode
 *  - any multi-strategy phase still unanswered → pickStrategy
 *  - all done → confirm
 */
export function nextStep(state: WizardState): WizardStep {
  if (!state.type) return "pickType";
  if (!state.contentId) return "pickContent";
  if (!state.mode) return "pickMode";

  const content = getContentByIdSafe(state.contentId);
  if (!content) return "pickContent"; // recover from a stale id
  const multiStrategyPhases = content.phases.filter((p) => p.strategies.length >= 2);
  for (let i = state.pendingPhaseIdx; i < multiStrategyPhases.length; i++) {
    const phase = multiStrategyPhases[i];
    if (!state.phaseStrategies[phase.id]) return "pickStrategy";
  }

  return "confirm";
}

function getContentByIdSafe(id: string): Content | null {
  return getAllContents().find((c) => c.id === id) ?? null;
}

// ── Step UI builders ────────────────────────────────────────────────────────

export interface StepMessage {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
  content?: string;
}

export function buildStepMessage(state: WizardState): StepMessage {
  const step = nextStep(state);
  switch (step) {
    case "pickType":     return buildPickType(state);
    case "pickContent":  return buildPickContent(state);
    case "pickMode":     return buildPickMode(state);
    case "pickStrategy": return buildPickStrategy(state);
    case "confirm":      return buildConfirm(state);
    case "done":         return buildDone(state);
  }
}

function header(state: WizardState, title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`⚙️ /setup ウィザード — ${state.name}`)
    .setColor(0x6e85b7)
    .setDescription(`**${title}**\n${description}`);
}

function cancelRow(state: WizardState): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${WIZARD_PREFIX}${state.sessionId}:cancel`)
      .setLabel("✖ キャンセル")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildPickType(state: WizardState): StepMessage {
  const embed = header(
    state,
    "🎯 コンテンツの種類を選んでください",
    "目標とする raid / trial の種別。"
  );
  // 8 choices → 2 rows × 4 buttons (within ActionRow 5 limit)
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < CONTENT_TYPE_CHOICES.length; i += 4) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const choice of CONTENT_TYPE_CHOICES.slice(i, i + 4)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${WIZARD_PREFIX}${state.sessionId}:type:${choice.value}`)
          .setLabel(choice.name)
          .setStyle(ButtonStyle.Primary)
      );
    }
    rows.push(row);
  }
  rows.push(cancelRow(state));
  return { embeds: [embed], components: rows };
}

function buildPickContent(state: WizardState): StepMessage {
  const all = getAllContents().filter((c) => c.type === state.type);
  const sorted = sortByPatch(all);
  const embed = header(
    state,
    `📜 コンテンツを選んでください (${sorted.length} 件)`,
    `種別: \`${state.type}\` — 該当コンテンツを 1 つ選択。`
  );
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${WIZARD_PREFIX}${state.sessionId}:content`)
    .setPlaceholder("コンテンツを選択…")
    .addOptions(
      sorted.slice(0, 25).map((c) => ({
        label: `${c.displayName} (${c.shortName})`.slice(0, 100),
        description: c.patch ? `patch ${c.patch}` : undefined,
        value: c.id,
      }))
    );
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      cancelRow(state),
    ],
  };
}

function buildPickMode(state: WizardState): StepMessage {
  const embed = header(
    state,
    "🛠 セットアップモードを選んでください",
    [
      "**標準** — ロビー / 全体 / 軽減表 / 動画-参考 / 進行度 / 雑談 / 日程 + Phase channels",
      "**早期攻略** — 標準 + 攻略情報-発見 + ログ-fflogs",
      "**最小** — ロビー + 日程 + Phase channels だけ",
    ].join("\n")
  );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${WIZARD_PREFIX}${state.sessionId}:mode:standard`)
      .setLabel("標準")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${WIZARD_PREFIX}${state.sessionId}:mode:race`)
      .setLabel("早期攻略")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${WIZARD_PREFIX}${state.sessionId}:mode:minimal`)
      .setLabel("最小")
      .setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row, cancelRow(state)] };
}

function buildPickStrategy(state: WizardState): StepMessage {
  const content = getContentByIdSafe(state.contentId!);
  if (!content) return buildConfirm(state);
  const multiPhases = content.phases.filter((p) => p.strategies.length >= 2);
  const phase = multiPhases[state.pendingPhaseIdx];
  if (!phase) return buildConfirm(state);

  const popular = phase.strategies.find((s) => s.popular);
  const total = multiPhases.length;
  const idx = state.pendingPhaseIdx + 1;
  const embed = header(
    state,
    `🎯 ${phase.name} の処理法を選んでください (${idx}/${total})`,
    popular
      ? `⭐ = 野良主流。 \`${popular.name}\` を選ぶか他の処理法を選択。`
      : "野良主流が未設定のため、 どれかを選んでください。"
  );

  // Strategies: variable count, max 5 buttons per row (Discord)
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < phase.strategies.length; i++) {
    const s = phase.strategies[i];
    if (i > 0 && i % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
    }
    row.addComponents(buildStrategyButton(state, phase.id, s));
  }
  if (row.components.length > 0) rows.push(row);
  rows.push(cancelRow(state));
  return { embeds: [embed], components: rows };
}

function buildStrategyButton(
  state: WizardState,
  phaseId: string,
  s: StrategyVariant
): ButtonBuilder {
  const label = s.popular ? `⭐ ${s.name}` : s.name;
  return new ButtonBuilder()
    .setCustomId(`${WIZARD_PREFIX}${state.sessionId}:strat:${phaseId}:${s.id}`)
    .setLabel(label.slice(0, 80))
    .setStyle(s.popular ? ButtonStyle.Primary : ButtonStyle.Secondary);
}

function buildConfirm(state: WizardState): StepMessage {
  const content = getContentByIdSafe(state.contentId!);
  if (!content) return buildPickContent(state);
  const lines: string[] = [
    `**名前**: ${state.name}`,
    `**コンテンツ**: ${content.displayName} (${content.shortName}) — ${state.type}`,
    `**モード**: ${state.mode}`,
  ];
  const chosenPhases = content.phases.filter(
    (p) => p.strategies.length >= 2 && state.phaseStrategies[p.id]
  );
  if (chosenPhases.length > 0) {
    lines.push("");
    lines.push(`**選んだ処理法**:`);
    for (const p of chosenPhases) {
      const sid = state.phaseStrategies[p.id];
      const s = p.strategies.find((s) => s.id === sid);
      lines.push(`└ **${p.name}**: ${s?.name ?? sid}`);
    }
  }
  const embed = header(state, "✨ 以下の設定で作成しますか？", lines.join("\n"));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${WIZARD_PREFIX}${state.sessionId}:create`)
      .setLabel("✅ 作成")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${WIZARD_PREFIX}${state.sessionId}:cancel`)
      .setLabel("✖ キャンセル")
      .setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

function buildDone(state: WizardState): StepMessage {
  // Just a placeholder — actual success message is built by the create handler
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("✅ 完了")
        .setColor(0x6e85b7)
        .setDescription(`「${state.name}」 を作成しました。`),
    ],
    components: [],
  };
}

// ── customId parsing ────────────────────────────────────────────────────────

export interface ParsedWizardAction {
  sessionId: string;
  /** "type" | "content" | "mode" | "strat" | "create" | "cancel" */
  action: string;
  /** Action-specific payload */
  payload?: string;
  /** For "strat" action: phaseId */
  phaseId?: string;
}

export function parseWizardCustomId(customId: string): ParsedWizardAction | null {
  if (!customId.startsWith(WIZARD_PREFIX)) return null;
  const rest = customId.slice(WIZARD_PREFIX.length);
  const parts = rest.split(":");
  if (parts.length < 2) return null;
  const [sessionId, action, ...tail] = parts;
  if (!sessionId || !action) return null;

  if (action === "strat") {
    // setup-wizard:<sid>:strat:<phaseId>:<stratId>
    if (tail.length !== 2) return null;
    return { sessionId, action, phaseId: tail[0], payload: tail[1] };
  }
  // setup-wizard:<sid>:<action>[:<payload>]
  return { sessionId, action, payload: tail[0] };
}

// ── State updaters ──────────────────────────────────────────────────────────

export function applyTypeChoice(state: WizardState, type: string): WizardState {
  return { ...state, type: type as ContentType };
}

export function applyContentChoice(state: WizardState, contentId: string): WizardState {
  return { ...state, contentId };
}

export function applyModeChoice(state: WizardState, mode: string): WizardState {
  return { ...state, mode: mode as WizardState["mode"] };
}

/**
 * Record strategy choice + advance pendingPhaseIdx. Caller persists.
 * If phaseId doesn't match the currently-pending phase, do nothing (defensive
 * against late button clicks from earlier wizard states).
 */
export function applyStrategyChoice(
  state: WizardState,
  phaseId: string,
  strategyId: string
): WizardState {
  const content = getContentByIdSafe(state.contentId!);
  if (!content) return state;
  const multiPhases = content.phases.filter((p) => p.strategies.length >= 2);
  const expected = multiPhases[state.pendingPhaseIdx];
  if (!expected || expected.id !== phaseId) return state;
  return {
    ...state,
    phaseStrategies: { ...state.phaseStrategies, [phaseId]: strategyId },
    pendingPhaseIdx: state.pendingPhaseIdx + 1,
  };
}

/** Pre-populate `phaseStrategies` with popular: true defaults for skipped phases. */
export function applyPopularDefaults(state: WizardState): WizardState {
  const content = getContentByIdSafe(state.contentId!);
  if (!content) return state;
  const filled: Record<string, string> = { ...state.phaseStrategies };
  for (const phase of content.phases) {
    if (phase.strategies.length >= 2 && !filled[phase.id]) {
      const popular = phase.strategies.find((s) => s.popular);
      if (popular) filled[phase.id] = popular.id;
    }
  }
  return { ...state, phaseStrategies: filled };
}

/** True if user has answered all strategy questions (or skipped via defaults). */
export function isReadyToConfirm(state: WizardState): boolean {
  return Boolean(state.type && state.contentId && state.mode);
}
