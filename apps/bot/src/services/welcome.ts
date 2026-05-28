/**
 * Welcome / onboarding flow.
 *
 * Triggered when:
 *  1. Bot joins a new guild (Events.GuildCreate) — auto-post to system channel
 *  2. User runs `/quickstart` — ephemeral re-display for late-joiners
 *
 * The same embed builder is reused in both paths to keep the message consistent.
 */
import {
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
  type Guild,
  type GuildTextBasedChannel,
} from "discord.js";

/**
 * Build the welcome embed. Returns a fresh builder each call.
 *
 * Sections:
 *  - 3 step quickstart (固定作成 → 予定登録 → 練習)
 *  - 主要コマンド (categorized)
 *  - 必要な権限の説明
 *  - ヘルプとガイドへのリンク
 */
export function buildWelcomeEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🎉 固定支援Bot へようこそ！")
    .setColor(0x6e85b7)
    .setDescription(
      "FF14 の固定パーティ活動を Discord 上で支援する Bot です。\n" +
        "**3 ステップで始められます** ↓"
    )
    .addFields(
      {
        name: "1️⃣ 固定を作成",
        value:
          "`/setup` でコンテンツと固定名を入力 → Discord channel + role が自動生成。\n" +
          "例: `/setup type:絶 content:FRU name:週末FRU`",
        inline: false,
      },
      {
        name: "2️⃣ 予定を登録",
        value:
          "`/book when:2026-06-01 21:00` で予定登録 → 開始 10 分前に自動通知。\n" +
          "調整さん URL があれば `/from-chouseisan url:...` で候補日インポート可。",
        inline: false,
      },
      {
        name: "3️⃣ 練習しながら使う",
        value:
          "`/macro` `/tips` でマクロや攻略 tips、 `/progress mark` で到達記録、\n" +
          "`/static-info` で現在の状況、 `/help` で全コマンド。",
        inline: false,
      },
      {
        name: "📋 主要コマンド",
        value:
          "**📅 予定**: `/book` `/upcoming` `/cancel` `/recurring`\n" +
          "**🗳️ 投票**: `/vote new` `/vote close` `/vote book` `/from-chouseisan`\n" +
          "**📊 固定**: `/setup` `/static-info` `/progress`\n" +
          "**📜 攻略**: `/macro` `/tips` `/share` `/recruit`",
        inline: false,
      },
      {
        name: "🔒 必要な権限",
        value:
          "Bot は `Manage Channels` + `Manage Roles` + `Send Messages` が必要です。\n" +
          "OAuth 招待時に付与されていない場合、 `/setup` が失敗します。",
        inline: false,
      }
    )
    .setFooter({
      text: "詳細: /help · web ガイド: 詳しい使い方は /guide ページへ",
    });
}

/**
 * Find the best channel to post a welcome message to.
 *
 * Priority:
 *   1. guild.systemChannel (set in guild settings — usually #general)
 *   2. First text channel where the bot has SendMessages permission
 *
 * Returns null if no suitable channel is found.
 */
export function findWelcomeChannel(guild: Guild): GuildTextBasedChannel | null {
  const me = guild.members.me;
  if (!me) return null;

  // System channel — check we can send to it
  const sys = guild.systemChannel;
  if (sys && sys.isTextBased() && sys.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages)) {
    return sys;
  }

  // Fallback: scan channels in cache (cheap if guild has fewer than ~50 channels).
  // Restrict to GuildText channels (which have .position) and verify SendMessages.
  const candidates = Array.from(guild.channels.cache.values())
    .filter(
      (c): c is GuildTextBasedChannel & { position: number } =>
        c.type === ChannelType.GuildText &&
        c.isTextBased() &&
        c.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages) === true
    )
    .sort((a, b) => a.position - b.position);

  return candidates[0] ?? null;
}

/**
 * Post the welcome embed to the most appropriate channel in a guild.
 * Idempotency: caller can guard against re-posting on rejoin via DB if needed;
 * by default this just posts whenever called.
 */
export async function postWelcomeToGuild(guild: Guild): Promise<{ posted: boolean; channelId: string | null }> {
  const channel = findWelcomeChannel(guild);
  if (!channel) {
    return { posted: false, channelId: null };
  }
  await channel.send({ embeds: [buildWelcomeEmbed()] });
  return { posted: true, channelId: channel.id };
}
