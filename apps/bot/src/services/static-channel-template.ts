import type { Content } from "@ff14kotei/schema";
import type { ChannelSpec } from "./channel-setup";
import { buildChannelPlan } from "./channel-setup";

export type SetupMode = "standard" | "race" | "minimal";

export const SETUP_MODE_DESCRIPTIONS: Record<SetupMode, string> = {
  standard: "標準 (ロビー/雑談/日程/軽減/動画/進行度 + Phase channels)",
  race: "早期攻略 (標準 + 攻略情報・発見 + ログ・FFLogs channels)",
  minimal: "最小 (ロビー + 日程 + Phase channels だけ)",
};

export interface UtilityChannel {
  /** Channel name (lowercased automatically) */
  name: string;
  topic: string;
  /** Optional: where to remember this in the DB. lobby = main chat target. */
  role?: "lobby" | "scheduling" | "mitigation" | "videos" | "progress" | "race-notes" | "logs";
}

export interface ChannelTemplate {
  /** Utility channels created above the Phase channels. Order matters (channels appear top-down). */
  utility: UtilityChannel[];
  /** Phase channels, derived from content. */
  phases: ChannelSpec[];
}

/**
 * Build the full channel template based on mode + content.
 * Pure function — no Discord side effects.
 */
export function buildChannelTemplate(
  content: Content,
  options: { mode?: SetupMode; partyName?: string } = {}
): ChannelTemplate {
  const mode: SetupMode = options.mode ?? "standard";
  const utility = utilityChannelsFor(mode);
  const phases = buildChannelPlan(content, { partyName: options.partyName }).channels;
  return { utility, phases };
}

function utilityChannelsFor(mode: SetupMode): UtilityChannel[] {
  if (mode === "minimal") {
    return [
      { name: "ロビー", topic: "総合チャネル", role: "lobby" },
      { name: "日程調整", topic: "日程の相談・調整さん URL の共有", role: "scheduling" },
    ];
  }

  const base: UtilityChannel[] = [
    { name: "ロビー", topic: "総合チャネル — お知らせ、アナウンスはここ", role: "lobby" },
    { name: "雑談", topic: "雑談チャネル — ゲーム外の話題もOK" },
    { name: "日程調整", topic: "日程の相談・調整さん URL の共有", role: "scheduling" },
    { name: "軽減表", topic: "軽減表のリンクと管理", role: "mitigation" },
    { name: "動画-参考", topic: "攻略動画・参考URL集", role: "videos" },
    { name: "進行度-記録", topic: "Phase 突破履歴・セッション記録", role: "progress" },
  ];

  if (mode === "race") {
    base.push(
      {
        name: "攻略情報-発見",
        topic: "新ギミック・新マクロ・暫定処理方のメモ (早期攻略中)",
        role: "race-notes",
      },
      {
        name: "ログ-fflogs",
        topic: "FFLogs / ダメージ計算 / 解析共有",
        role: "logs",
      }
    );
  }

  return base;
}

/**
 * Sanitize utility channel names like the phase channels (lowercase, no spaces).
 */
export function sanitizeUtilityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "untitled";
}
