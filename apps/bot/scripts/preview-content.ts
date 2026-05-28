/**
 * Preview script — render what the bot would post for a given content,
 * WITHOUT launching the bot or hitting Discord.
 *
 * Outputs:
 *   - All utility channel intros (overview / mitigation / videos / scheduling)
 *   - All phase channel intros (with optional selected-strategy preview)
 *
 * Usage:
 *   pnpm --filter @ff14kotei/bot exec tsx scripts/preview-content.ts <content_id> [phase_id:strategy_id,...]
 *
 * Examples:
 *   pnpm --filter @ff14kotei/bot exec tsx scripts/preview-content.ts fru
 *   pnpm --filter @ff14kotei/bot exec tsx scripts/preview-content.ts tea p1:dice-1211
 *   pnpm --filter @ff14kotei/bot exec tsx scripts/preview-content.ts top p3:ast-shiki,p3:hello-world-far-near
 */
import { resolve } from "node:path";
import { loadAllContents } from "@ff14kotei/schema";
import { buildPhaseEmbed } from "../src/services/phase-channel-poster";

const CONTENTS_DIR = resolve(process.cwd(), "../../data/contents");

function parseSelectedStrategies(arg: string | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!arg) return out;
  for (const pair of arg.split(",")) {
    const [phaseId, strategyId] = pair.split(":");
    if (!phaseId || !strategyId) continue;
    (out[phaseId] ??= []).push(strategyId);
  }
  return out;
}

function divider(title: string, char = "═"): string {
  const bar = char.repeat(60);
  return `\n${bar}\n  ${title}\n${bar}`;
}

function renderEmbedAsText(embed: ReturnType<typeof buildPhaseEmbed>): string {
  const data = embed.toJSON();
  const lines: string[] = [];
  if (data.title) lines.push(`📘 ${data.title}`);
  if (data.description) {
    lines.push("");
    lines.push(data.description);
  }
  for (const field of data.fields ?? []) {
    lines.push("");
    lines.push(`【${field.name}】`);
    lines.push(field.value);
  }
  return lines.join("\n");
}

function renderOverviewChannelText(content: import("@ff14kotei/schema").Content): string {
  const lines: string[] = [
    `**🌐 全体 — ${content.displayName}**`,
    ``,
  ];
  if (content.overview?.mainStrategy) {
    lines.push(`**🎯 主流処理法**`);
    lines.push(`└ ${content.overview.mainStrategy}`);
    lines.push("");
  }
  if (content.overview?.videoPlaylist) {
    const v = content.overview.videoPlaylist;
    const author = v.author ? ` — ${v.author}` : "";
    lines.push(`**🎬 攻略動画プレイリスト**`);
    lines.push(`└ [${v.title}](${v.url})${author}`);
    lines.push("");
  }
  const phasesWithPopular = content.phases.filter((p) => p.popularStrategy);
  if (phasesWithPopular.length > 0) {
    lines.push(`**📍 Phase 別 野良主流**`);
    for (const p of phasesWithPopular) {
      lines.push(`└ **${p.name}**: ${p.popularStrategy}`);
    }
    lines.push("");
  }
  const macro = content.overview?.partyWideMacro;
  if (macro) {
    lines.push(`**📜 編成全体マクロ**`);
    lines.push(`└ [${macro.source}](${macro.url})`);
    lines.push("");
  }
  if (content.overview?.guideUrl) {
    lines.push(`**📚 攻略ガイド**`);
    lines.push(`└ <${content.overview.guideUrl}>`);
    lines.push("");
  }
  if (content.overview?.bisUrl) {
    lines.push(`**⚔️ 最適装備 (BiS)**`);
    lines.push(`└ <${content.overview.bisUrl}>`);
    lines.push("");
  }
  if (content.macros.length > 0) {
    const byPhase = new Map<string | null, typeof content.macros>();
    for (const m of content.macros) {
      const key = m.phaseId ?? null;
      if (!byPhase.has(key)) byPhase.set(key, []);
      byPhase.get(key)!.push(m);
    }
    const phaseOrder = content.phases.map((p) => p.id);
    const orderedKeys: (string | null)[] = [
      ...phaseOrder.filter((id) => byPhase.has(id)),
      ...(byPhase.has(null) ? [null] : []),
    ];
    if (orderedKeys.length > 0) {
      lines.push(`**📜 マクロ一覧**`);
      for (const key of orderedKeys) {
        const phase = key ? content.phases.find((p) => p.id === key) : null;
        lines.push(`**${phase ? phase.name : "全体"}**`);
        for (const m of byPhase.get(key)!) {
          const tag = m.strategyId ? ` *[${m.strategyId}]*` : "";
          lines.push(`└ [${m.source}](${m.url})${tag}`);
        }
      }
    }
  }
  return lines.join("\n");
}

function renderMitigationChannelText(content: import("@ff14kotei/schema").Content): string {
  const lines: string[] = [`**🛡 軽減表 — ${content.displayName}**`, ``];
  const phasesWithMit = content.phases.filter((p) => p.mitigation);
  if (phasesWithMit.length === 0) {
    lines.push("> 軽減表テンプレが未登録です。");
    return lines.join("\n");
  }
  const seen = new Set<string>();
  for (const phase of phasesWithMit) {
    const m = phase.mitigation!;
    if (seen.has(m.url)) continue;
    seen.add(m.url);
    const copyHint = m.copyable ? " — **コピー推奨**" : "";
    lines.push(`**${phase.name}**`);
    lines.push(`└ [${m.name}](${m.url})${copyHint}`);
    lines.push("");
  }
  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────

const contentId = process.argv[2];
const selectedArg = process.argv[3];
if (!contentId) {
  console.error("Usage: tsx scripts/preview-content.ts <content_id> [phase_id:strategy_id,...]");
  console.error("Example: tsx scripts/preview-content.ts tea p1:dice-1211");
  process.exit(1);
}

const contents = loadAllContents(CONTENTS_DIR);
const content = contents.find((c) => c.id === contentId);
if (!content) {
  console.error(`Content not found: ${contentId}`);
  console.error(`Available: ${contents.map((c) => c.id).join(", ")}`);
  process.exit(1);
}

const selected = parseSelectedStrategies(selectedArg);

console.log(divider(`CONTENT: ${content.displayName} (${content.shortName}) — ${content.type} ${content.patch ?? ""}`));

console.log(divider("Utility channel: 全体 (overview)"));
console.log(renderOverviewChannelText(content));

if (content.phases.some((p) => p.mitigation)) {
  console.log(divider("Utility channel: 軽減表 (mitigation)"));
  console.log(renderMitigationChannelText(content));
}

for (const phase of content.phases) {
  const sel = selected[phase.id];
  const selectedTag = sel ? ` [selected: ${sel.join(", ")}]` : "";
  console.log(divider(`Phase channel: ${phase.name}${selectedTag}`));
  const embed = buildPhaseEmbed(content, phase, {
    variant: "intro",
    selectedStrategyIds: sel,
  });
  console.log(renderEmbedAsText(embed));
}

console.log("\n" + "═".repeat(60));
console.log(`Done. To preview with selected strategies, e.g.:`);
console.log(`  tsx scripts/preview-content.ts ${contentId} p1:strategy-id,p3:another-id`);
