import { EmbedBuilder, type TextChannel } from "discord.js";
import type { Content, Phase } from "@ff14kotei/schema";
import { getMacrosForPhase, splitMacroForDiscord } from "./phase-content";

/** Render variant — keeps two views without code duplication. */
export type PhaseEmbedVariant = "intro" | "full";

export interface BuildPhaseEmbedOptions {
  /**
   * `intro` (used by /setup phase channel intro):
   *   - 野良主流 line at top
   *   - 処理法 (strategies)
   *   - 攻略動画 (markdown link + author)
   *   - NO tips / mitigation / description / macro list
   *     → users run /tips, /macro, /share on demand
   *
   * `full` (used by /share — current behavior):
   *   - everything in intro + description + tips + mitigation + macro list
   */
  variant?: PhaseEmbedVariant;
  color?: number;
  /**
   * Strategy IDs chosen for THIS phase via the setup wizard. A phase can have
   * multiple — one per independent gimmick (e.g. TOP P3 picks one of 検知式
   * AND one of ハローワールド variants). All matched strategies are prefixed
   * with ✅ and listed at the top of the description.
   */
  selectedStrategyIds?: string[];
  /** @deprecated single-strategy back-compat. Prefer `selectedStrategyIds`. */
  selectedStrategyId?: string;
}

/**
 * Build the Phase info embed.
 * Pure function — Discord API not called here.
 *
 * Back-compat: third arg may be a number (color) for older callers.
 */
export function buildPhaseEmbed(
  content: Content,
  phase: Phase,
  options: BuildPhaseEmbedOptions | number = {}
): EmbedBuilder {
  const opts: BuildPhaseEmbedOptions =
    typeof options === "number" ? { color: options } : options;
  const variant = opts.variant ?? "intro";
  const color = opts.color ?? 0x6e85b7;

  const embed = new EmbedBuilder()
    .setTitle(`${phase.name} — ${content.displayName}`)
    .setColor(color);

  // Normalize: accept either selectedStrategyIds (preferred) or selectedStrategyId
  const selectedIds = new Set<string>(
    opts.selectedStrategyIds ?? (opts.selectedStrategyId ? [opts.selectedStrategyId] : [])
  );
  const selectedList = phase.strategies.filter((s) => selectedIds.has(s.id));

  // Top description: 選んだ処理法 (if any) > 野良主流 fallback, + description in full mode
  //
  // 「野良主流」 line is only meaningful when:
  //   - 0 strategies (no variants defined) → use popularStrategy as a phase summary
  //   - 2+ strategies → point users to which variant is the popular one
  // When exactly 1 strategy exists, the "処理法" field below ALREADY shows it
  // as THE answer, so a「野良主流: X」 line above just duplicates info.
  const descParts: string[] = [];
  if (selectedList.length > 0) {
    const lines = selectedList.map((s) => {
      const desc = s.description ? ` — ${s.description.split("\n")[0]}` : "";
      return `• **${s.name}**${desc}`;
    });
    descParts.push(`**🎯 この固定の処理法**\n${lines.join("\n")}`);
  } else if (phase.popularStrategy && phase.strategies.length !== 1) {
    descParts.push(`**野良主流**: ${phase.popularStrategy}`);
  }
  if (variant === "full" && phase.description) {
    descParts.push(phase.description);
  }
  if (descParts.length > 0) {
    embed.setDescription(descParts.join("\n\n").slice(0, 4096));
  }

  // 処理法 — both variants. Selected strategies are prefixed with ✅
  if (phase.strategies.length > 0) {
    embed.addFields({
      name: "処理法",
      value: phase.strategies
        .map((s) => {
          const check = selectedIds.has(s.id) ? "✅ " : "";
          const desc = s.description ? ` — ${s.description.split("\n")[0]}` : "";
          return `${check}**${s.name}**${desc}`;
        })
        .join("\n")
        .slice(0, 1024),
    });
  }

  // 攻略動画 — both variants (numbered, link + author)
  if (phase.videos.length > 0) {
    embed.addFields({
      name: "攻略動画",
      value: phase.videos
        .map((v, i) => `${i + 1}) [${v.title}](${v.url})${v.author ? ` — ${v.author}` : ""}`)
        .join("\n")
        .slice(0, 1024),
    });
  }

  // tips / mitigation / macro list — full only
  if (variant === "full") {
    if (phase.tips.length > 0) {
      embed.addFields({
        name: "Tips",
        value: phase.tips.map((t) => `• ${t}`).join("\n").slice(0, 1024),
      });
    }

    if (phase.mitigation) {
      embed.addFields({
        name: "軽減表",
        value: `[${phase.mitigation.name}](${phase.mitigation.url})${
          phase.mitigation.copyable ? "（コピー推奨）" : ""
        }`,
      });
    }

    const macros = getMacrosForPhase(content, phase.id);
    if (macros.length > 0) {
      embed.addFields({
        name: `マクロ (${macros.length}個)`,
        value: macros
          .map((m, i) => `${i + 1}. [${m.source}](${m.url})`)
          .join("\n")
          .slice(0, 1024),
      });
    }
  }

  return embed;
}

export interface PostPhaseResult {
  ok: boolean;
  pinned: boolean;
  error?: string;
}

/**
 * Post the Phase embed + (optional) macros to a channel, and optionally pin the embed.
 * Used by /static-init to seed Phase channels at setup time.
 */
export async function postPhaseToChannel(
  channel: TextChannel,
  content: Content,
  phase: Phase,
  options: {
    includeMacros?: boolean;
    pin?: boolean;
    selectedStrategyIds?: string[];
    /** @deprecated single-strategy back-compat. */
    selectedStrategyId?: string;
  } = {}
): Promise<PostPhaseResult> {
  const includeMacros = options.includeMacros ?? false;
  const shouldPin = options.pin ?? false;

  try {
    const embed = buildPhaseEmbed(content, phase, {
      selectedStrategyIds: options.selectedStrategyIds,
      selectedStrategyId: options.selectedStrategyId,
    });
    const msg = await channel.send({ embeds: [embed] });

    if (includeMacros) {
      const macros = getMacrosForPhase(content, phase.id);
      for (const macro of macros) {
        if (!macro.text) continue;
        const chunks = splitMacroForDiscord(macro.text);
        for (let i = 0; i < chunks.length; i++) {
          const label =
            chunks.length > 1 ? `**${macro.source}** (${i + 1}/${chunks.length})` : `**${macro.source}**`;
          await channel.send({ content: `${label}\n\`\`\`\n${chunks[i]}\n\`\`\`` });
        }
      }
    }

    let pinned = false;
    if (shouldPin) {
      try {
        await msg.pin();
        pinned = true;
      } catch {
        // pin fails if bot lacks ManageMessages; not fatal
      }
    }

    return { ok: true, pinned };
  } catch (err) {
    return {
      ok: false,
      pinned: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Post a single intro message to a utility channel based on its role.
 * Returns the message ID or null on failure.
 */
export async function postUtilityIntro(
  channel: TextChannel,
  content: Content,
  role: string
): Promise<string | null> {
  try {
    switch (role) {
      case "lobby":
        await channel.send({
          content: [
            `**${content.displayName} 固定 — 立ち上げ完了 🎉**`,
            `下の Phase channels で攻略情報を確認してください。`,
            ``,
            `便利なコマンド:`,
            `• \`/macro content:${content.id} phase:p1\` — マクロを取得 (自分にだけ表示)`,
            `• \`/tips content:${content.id} phase:p1\` — Phase の Tips`,
            `• \`/book when:"YYYY-MM-DD HH:MM"\` — 次回固定を予約 (通知)`,
            `• \`/static-info\` — 固定メンバー・8 slot 状況・直近予定を確認`,
            `• \`/progress mark phase:p1 status:reached\` — マイルストーン記録`,
            `• \`/vote new\` — 次回日程を投票 (調整さん代替)`,
          ].join("\n"),
        });
        return null;

      case "mitigation": {
        // Group by phase order so the lineup matches the phase channels above.
        const lines: string[] = [
          `**🛡 軽減表 — ${content.displayName}**`,
          ``,
        ];
        const phasesWithMit = content.phases.filter((p) => p.mitigation);
        if (phasesWithMit.length === 0) {
          lines.push("> 軽減表テンプレが未登録です。固定主が独自に作成・共有してください。");
        } else {
          // Dedupe by URL (multiple phases sometimes share one sheet)
          const seen = new Set<string>();
          for (const phase of phasesWithMit) {
            const m = phase.mitigation!;
            if (seen.has(m.url)) continue;
            seen.add(m.url);
            const copyHint = m.copyable ? " — **コピーして固定用にカスタマイズしてください**" : "";
            lines.push(`**${phase.name}**`);
            lines.push(`└ [${m.name}](${m.url})${copyHint}`);
            lines.push("");
          }
        }
        lines.push(`💡 個別 Phase の軽減確認は \`/share phase:p1\` でも見られます。`);
        await channel.send({ content: lines.join("\n").slice(0, 2000) });
        return null;
      }

      case "overview": {
        const lines: string[] = [
          `**🌐 全体 — ${content.displayName}**`,
          ``,
        ];

        // 主流処理法 (content-level)
        if (content.overview?.mainStrategy) {
          lines.push(`**🎯 主流処理法**`);
          lines.push(`└ ${content.overview.mainStrategy}`);
          lines.push("");
        }

        // 攻略動画プレイリスト (content-level)
        if (content.overview?.videoPlaylist) {
          const v = content.overview.videoPlaylist;
          const author = v.author ? ` — ${v.author}` : "";
          lines.push(`**🎬 攻略動画プレイリスト**`);
          lines.push(`└ [${v.title}](${v.url})${author}`);
          lines.push("");
        }

        // Phase 別 popular strategy 一覧 (見出し的に)
        const phasesWithPopular = content.phases.filter((p) => p.popularStrategy);
        if (phasesWithPopular.length > 0) {
          lines.push(`**📍 Phase 別 野良主流**`);
          for (const p of phasesWithPopular) {
            lines.push(`└ **${p.name}**: ${p.popularStrategy}`);
          }
          lines.push("");
        }

        // 編成全体マクロ (link)
        const macro = content.overview?.partyWideMacro;
        if (macro) {
          lines.push(`**📜 編成全体マクロ**`);
          lines.push(`└ [${macro.source}](${macro.url})`);
          lines.push("");
        }

        // 攻略ガイド (元 URL) — リリーどーる / Lodestone post / note 等
        if (content.overview?.guideUrl) {
          lines.push(`**📚 攻略ガイド**`);
          lines.push(`└ <${content.overview.guideUrl}>`);
          lines.push("");
        }

        // 最適装備 (BiS) — Etro / The Balance 等
        if (content.overview?.bisUrl) {
          lines.push(`**⚔️ 最適装備 (BiS)**`);
          lines.push(`└ <${content.overview.bisUrl}>`);
          lines.push("");
        }

        // Phase 別マクロ一覧 — phase 順で並べ、 残った無印 (= 全体) は末尾。
        // partyWideMacro と内容重複しても短い list なので OK。
        if (content.macros.length > 0) {
          const macrosByPhase = new Map<string | null, typeof content.macros>();
          for (const m of content.macros) {
            const key = m.phaseId ?? null;
            if (!macrosByPhase.has(key)) macrosByPhase.set(key, []);
            macrosByPhase.get(key)!.push(m);
          }
          // Order phaseId entries by their order in content.phases, then null at end.
          const phaseIdOrder = content.phases.map((p) => p.id);
          const orderedKeys: (string | null)[] = [
            ...phaseIdOrder.filter((id) => macrosByPhase.has(id)),
            ...(macrosByPhase.has(null) ? [null] : []),
          ];
          if (orderedKeys.length > 0) {
            lines.push(`**📜 マクロ一覧**`);
            for (const key of orderedKeys) {
              const phase = key ? content.phases.find((p) => p.id === key) : null;
              const heading = phase ? phase.name : "全体";
              lines.push(`**${heading}**`);
              for (const m of macrosByPhase.get(key)!) {
                lines.push(`└ [${m.source}](${m.url})`);
              }
            }
            lines.push("");
          }
        }

        if (lines.length <= 3) {
          lines.push(
            "> このコンテンツの overview データはまだ未登録です。",
            "> sheet の `contents` タブで overview 系列の列を埋めると自動表示されます。"
          );
        } else {
          lines.push(`💡 個別 Phase の詳細は上の Phase channels で。 マクロ本文は \`/macro content:${content.id} phase:p1\` で取得。`);
        }

        const intro = lines.join("\n").slice(0, 2000);
        await channel.send({ content: intro });

        // 編成全体マクロ の本文を別 message として post (もし text があれば)
        if (macro?.text) {
          const chunks = splitMacroForDiscord(macro.text);
          for (let i = 0; i < chunks.length; i++) {
            const header =
              chunks.length > 1
                ? `**${macro.source}** (${i + 1}/${chunks.length})`
                : `**${macro.source}**`;
            await channel.send({ content: `${header}\n\`\`\`\n${chunks[i]}\n\`\`\`` });
          }
        }
        return null;
      }

      case "videos": {
        const lines: string[] = [`**🎬 動画・参考 — ${content.displayName}**`, ``];

        // Labelled overview URLs (guide + BiS). The legacy untagged
        // `references.urls` array was removed — those are noise.
        if (content.overview?.guideUrl) {
          lines.push(`**📚 攻略ガイド**: <${content.overview.guideUrl}>`);
        }
        if (content.overview?.bisUrl) {
          lines.push(`**⚔️ 最適装備 (BiS)**: <${content.overview.bisUrl}>`);
        }
        // Aggregate phase videos
        const allVideos = content.phases.flatMap((p) =>
          p.videos.map((v) => ({ ...v, phaseId: p.id, phaseName: p.name }))
        );
        if (allVideos.length > 0) {
          lines.push(``);
          lines.push(`**Phase別 動画** (${allVideos.length}件):`);
          for (const v of allVideos.slice(0, 20)) {
            lines.push(`• [${v.phaseId}] [${v.title}](${v.url})`);
          }
        }
        await channel.send({ content: lines.join("\n").slice(0, 2000) });
        return null;
      }

      case "scheduling":
        await channel.send({
          content: [
            `**📅 日程調整チャネル**`,
            ``,
            `日程の相談はここで。\`/schedule\` で予約登録すると開始 N 分前に通知が飛びます。`,
            `調整さん等の URL は \`/schedule chouseisan_url:...\` で添付できます。`,
          ].join("\n"),
        });
        return null;

      case "progress":
        await channel.send({
          content: [
            `**🎯 進行度・記録**`,
            ``,
            `Phase 突破やセッションの記録をここに残しましょう。`,
            `(将来: \`/static-progress set phase:p3\` で自動記録予定)`,
          ].join("\n"),
        });
        return null;

      case "race-notes":
        await channel.send({
          content: [
            `**🆕 攻略情報・発見 (早期攻略)**`,
            ``,
            `新ギミック・暫定処理法・新マクロのメモはここに。`,
            `Phase channels は確定情報、ここは流動情報の置き場。`,
          ].join("\n"),
        });
        return null;

      case "logs":
        await channel.send({
          content: [
            `**📊 ログ・FFLogs**`,
            ``,
            `FFLogs リンク、ダメージ計算、解析結果の共有用。`,
            `(将来: FFLogs API 連携で自動解析予定)`,
          ].join("\n"),
        });
        return null;

      default:
        return null;
    }
  } catch (err) {
    console.warn(`postUtilityIntro failed for role=${role}:`, err);
    return null;
  }
}
