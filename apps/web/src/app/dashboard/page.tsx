import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, isAuthConfigured } from "@/auth";

export const metadata: Metadata = {
  title: "ダッシュボード — FF14 固定支援 Bot",
};

// Force dynamic — auth check happens on every request, no static prerender.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!isAuthConfigured()) {
    return (
      <div className="max-w-2xl mx-auto py-10 space-y-6">
        <h1 className="text-2xl font-bold">ダッシュボードは準備中です</h1>
        <p className="text-black/70 dark:text-white/70">
          Discord OAuth 認証情報が未設定のため、ログイン機能はまだ有効化されていません。
        </p>
        <div className="rounded-lg border border-black/10 dark:border-white/10 p-5 bg-black/5 dark:bg-white/5">
          <h2 className="font-semibold mb-2 text-sm">管理者向け設定方法</h2>
          <ol className="text-sm text-black/70 dark:text-white/70 list-decimal list-inside space-y-1">
            <li>
              Discord Developer Portal → OAuth2 → Reset Secret で <code>AUTH_DISCORD_SECRET</code> 取得
            </li>
            <li>
              <code>apps/web/.env.local</code> に以下を設定:
              <code className="block mt-1 bg-black/10 dark:bg-white/10 p-2 rounded text-xs">
                AUTH_SECRET=...{"\n"}AUTH_DISCORD_ID=...{"\n"}AUTH_DISCORD_SECRET=...
              </code>
            </li>
            <li>Web app を再起動</li>
          </ol>
        </div>
        <SectionPreview />
      </div>
    );
  }

  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin?callbackUrl=/dashboard");
  }

  const discordId = (session.user as { discordId?: string }).discordId;

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">こんにちは、{session.user.name ?? "プレイヤー"}さん</h1>
          {discordId && (
            <p className="text-sm text-black/50 dark:text-white/50">
              Discord ID: <code className="bg-black/5 dark:bg-white/10 px-1 py-0.5 rounded text-xs">{discordId}</code>
            </p>
          )}
        </div>
      </header>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-6 space-y-3">
        <h2 className="text-lg font-semibold">自分の固定 (準備中)</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          現在、bot は SQLite (ローカル) で固定データを管理しています。
          Web app からの参照は production の Postgres 移行後 に実装予定。
        </p>
        <p className="text-sm text-black/60 dark:text-white/60">
          それまでは Discord の bot コマンド <code>/upcoming</code> や <code>/raid</code> から確認してください。
        </p>
      </section>

      <SectionPreview />
    </div>
  );
}

function SectionPreview() {
  return (
    <section className="rounded-lg border border-black/10 dark:border-white/10 p-6 space-y-4">
      <h2 className="text-lg font-semibold">今後追加される機能</h2>
      <ul className="space-y-2 text-sm text-black/70 dark:text-white/70">
        <li className="flex items-start gap-2">
          <span className="text-black/40 mt-0.5">▸</span>
          <span>あなたが所属する Discord サーバーの固定一覧 + スケジュール</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-black/40 mt-0.5">▸</span>
          <span>軽減回しエディタ (timeline-based)</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-black/40 mt-0.5">▸</span>
          <span>募集テンプレジェネレーター (Lodestone BBCode / Twitter / Discord 形式)</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-black/40 mt-0.5">▸</span>
          <span>固定計画書 + 応募管理 (公開ページ /p/[id])</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-black/40 mt-0.5">▸</span>
          <span>進行度トラッカー (FFLogs / Vigil 連携)</span>
        </li>
      </ul>
      <p className="text-xs text-black/50 dark:text-white/50 mt-4">
        詳細設計: <Link href="https://github.com/mitchkunn/FF14-bot/blob/main/docs/static-leader-flow.md" className="underline">docs/static-leader-flow.md</Link>
      </p>
    </section>
  );
}
