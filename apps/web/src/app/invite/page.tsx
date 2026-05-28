import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "サーバーに追加 — 固定支援Bot",
  description: "Discord サーバーに 固定支援Bot を追加する手順。必要な権限と初期設定の解説。",
};

/**
 * Discord OAuth invite URL.
 * permissions = 8858889296 (bigint OK in URL; safe-int range)
 *   = Manage Channels + Manage Roles + Manage Messages + Send Messages
 *   + Embed Links + Attach Files + Read Message History + Mention Everyone
 *   + Add Reactions + Use External Emojis
 *   + **Manage Events** (bit 33 — required for /book wizard to create
 *     Discord scheduled events on the server's Events panel)
 *
 * client_id = AUTH_DISCORD_ID (Application ID, public)
 *
 * NOTE: bots invited with the previous integer (268921872) lack ManageEvents.
 * Either re-invite via this URL OR add "Manage Events" to the bot role
 * manually in Server Settings → Roles → 固定支援Bot → Permissions.
 */
const INVITE_URL =
  process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ??
  "https://discord.com/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&scope=bot+applications.commands&permissions=8858889296";

export default function InvitePage() {
  return (
    <div className="space-y-10 max-w-3xl mx-auto">
      <header className="text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-3">
          🤖 Discord サーバーに追加
        </h1>
        <p className="text-black/70 dark:text-white/70">
          固定主の段取りを自動化。3 分でセットアップ完了。
        </p>
      </header>

      <div className="text-center">
        <a
          href={INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 text-base font-semibold transition-colors shadow-md"
        >
          + Discord に追加
        </a>
        <p className="text-xs text-black/50 dark:text-white/50 mt-3">
          管理者権限のあるサーバーが必要です
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">必要な権限</h2>
        <p className="text-sm text-black/70 dark:text-white/70">
          /setup コマンドで category とチャネルを作成するため、以下の権限が必要です:
        </p>
        <ul className="text-sm space-y-1 text-black/70 dark:text-white/70">
          <PermItem name="チャンネルの管理" desc="Phase 別チャネル + category 作成のため" />
          <PermItem name="ロールの管理" desc="固定 role を作って fill メンバーに付与するため" />
          <PermItem name="メッセージの管理" desc="phase intro 投稿を pin するため (失敗してもセットアップは継続)" />
          <PermItem name="メッセージを送信" desc="alert / phase intro / vote 投稿のため" />
          <PermItem name="埋め込みリンク" desc="embed 投稿のため" />
          <PermItem name="メンション @ everyone, role" desc="alert で role mention するため (実際には @everyone は使わない)" />
          <PermItem name="イベントの管理" desc="/book で Discord 公式イベントを作成するため" />
        </ul>
        <p className="text-xs text-black/50 dark:text-white/50 mt-2">
          🛡️ Bot は自身が作成した role/channel しか操作しません。既存の物には影響しません。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">セットアップ手順</h2>
        <ol className="space-y-4 text-sm">
          <Step n={1} title="Bot をサーバーに招待">
            上の「Discord に追加」ボタンから OAuth フロー。サーバーに自分が「管理者」 or 「
            <code>Manage Server</code>」権限を持っている必要があります。
          </Step>
          <Step n={2} title="固定を作る (/setup)">
            <code>/setup type:絶 content:fru name:週末絶エデン</code> のように実行。
            <br />
            → 自動で <code>役割 + カテゴリ + Phase 別チャネル</code> 一式が作られ、各 Phase
            チャネルに マクロ + 攻略動画 + tips が投稿 + ピン留めされます。
          </Step>
          <Step n={3} title="メンバーを招待">
            <code>/setup ... members:&lt;@user1&gt; MT PLD, &lt;@user2&gt; ST WAR</code> のように既知メンバーを指定すれば slot
            に自動 fill + role 付与。後から追加も <code>/static-info</code> でできます。
          </Step>
          <Step n={4} title="予定を立てる">
            <code>/book when:2026-06-01 21:00</code> または{" "}
            <code>/recurring set day:fri time:21:00</code> で 開始 N 分前に自動通知。
            日程未定なら <code>/vote new</code> で候補投票 (調整さん代替)。
          </Step>
        </ol>
      </section>

      <section className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-5">
        <h2 className="font-semibold text-blue-700 dark:text-blue-300 mb-2">
          📖 全機能を見る
        </h2>
        <p className="text-sm text-black/70 dark:text-white/70 mb-3">
          /vote / /progress / /static-info / /recurring など、すべての コマンド の使い方は
          ガイドページにまとめています。
        </p>
        <Link
          href="/guide"
          className="inline-block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          → 使い方ガイドを見る
        </Link>
      </section>

      <section className="text-center pt-4">
        <p className="text-xs text-black/50 dark:text-white/50">
          困ったときは{" "}
          <a
            href="https://github.com/mitchkunn/FF14-bot/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            GitHub Issues
          </a>{" "}
          まで。
        </p>
      </section>
    </div>
  );
}

function PermItem({ name, desc }: { name: string; desc: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-green-600 mt-0.5">✓</span>
      <div>
        <span className="font-medium">{name}</span>
        <span className="text-black/50 dark:text-white/50"> — {desc}</span>
      </div>
    </li>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
        {n}
      </span>
      <div className="flex-1">
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-black/70 dark:text-white/70 leading-relaxed">{children}</p>
      </div>
    </li>
  );
}
