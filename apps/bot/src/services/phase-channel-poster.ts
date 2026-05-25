import { EmbedBuilder, type TextChannel } from "discord.js";
import type { Content, Phase } from "@ff14kotei/schema";
import { getMacrosForPhase, splitMacroForDiscord } from "./phase-content";

/**
 * Build the standard Phase info embed shared by /post-phase and /static-init.
 * Pure function — Discord API not called here.
 */
export function buildPhaseEmbed(content: Content, phase: Phase, color = 0x6e85b7): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${phase.name} — ${content.displayName}`)
    .setColor(color);

  if (phase.description) {
    embed.setDescription(phase.description.slice(0, 4096));
  }

  if (phase.strategies.length > 0) {
    embed.addFields({
      name: "処理方",
      value: phase.strategies
        .map((s) => `**${s.name}**${s.description ? ` — ${s.description.split("\n")[0]}` : ""}`)
        .join("\n")
        .slice(0, 1024),
    });
  }

  if (phase.videos.length > 0) {
    embed.addFields({
      name: "攻略動画",
      value: phase.videos
        .map((v) => `[${v.title}](${v.url})${v.author ? ` — ${v.author}` : ""}`)
        .join("\n")
        .slice(0, 1024),
    });
  }

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
  options: { includeMacros?: boolean; pin?: boolean } = {}
): Promise<PostPhaseResult> {
  const includeMacros = options.includeMacros ?? false;
  const shouldPin = options.pin ?? false;

  try {
    const embed = buildPhaseEmbed(content, phase);
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
            `• \`/schedule when:"YYYY-MM-DD HH:MM"\` — 次回固定を予約 (通知)`,
            `• \`/static-info\` — 固定メンバー・進行度を確認 (後日実装)`,
          ].join("\n"),
        });
        return null;

      case "mitigation": {
        const sheets = content.phases
          .map((p) => p.mitigation)
          .filter((m): m is NonNullable<typeof m> => Boolean(m));
        const lines: string[] = [
          `**🛡 軽減表まとめ — ${content.displayName}**`,
          ``,
        ];
        if (sheets.length === 0) {
          lines.push("> 軽減表テンプレが未登録です。固定主が独自に作成・共有してください。");
        } else {
          // dedupe by url
          const seen = new Set<string>();
          for (const s of sheets) {
            if (seen.has(s.url)) continue;
            seen.add(s.url);
            lines.push(`• [${s.name}](${s.url})${s.copyable ? " — **コピーして固定用にカスタマイズしてください**" : ""}`);
          }
        }
        await channel.send({ content: lines.join("\n") });
        return null;
      }

      case "videos": {
        const lines: string[] = [`**🎬 動画・参考 — ${content.displayName}**`, ``];
        if (content.references.primary) {
          lines.push(`**主参照**: ${content.references.primary}`);
        }
        if (content.references.urls.length > 0) {
          lines.push(``);
          lines.push(`**参考URL**:`);
          for (const url of content.references.urls.slice(0, 15)) {
            lines.push(`• <${url}>`);
          }
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
            `新ギミック・暫定処理方・新マクロのメモはここに。`,
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
