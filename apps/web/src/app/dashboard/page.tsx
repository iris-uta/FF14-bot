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
      <div className="max-w-2xl mx-auto text-center py-16">
        <h1 className="text-2xl font-bold mb-4">ダッシュボードは準備中です</h1>
        <p className="text-black/70 dark:text-white/70">
          Discord OAuth 認証情報が未設定のため、ログイン機能はまだ有効化されていません。
        </p>
        <p className="text-sm text-black/50 dark:text-white/50 mt-4">
          管理者: <code className="bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">AUTH_DISCORD_ID</code> /
          <code className="bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded ml-1">AUTH_DISCORD_SECRET</code> /
          <code className="bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded ml-1">AUTH_SECRET</code> を設定してください。
        </p>
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
            <p className="text-sm text-black/50 dark:text-white/50">Discord ID: <code>{discordId}</code></p>
          )}
        </div>
      </header>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-6">
        <h2 className="text-lg font-semibold mb-2">これから追加される機能</h2>
        <ul className="space-y-2 text-sm text-black/70 dark:text-white/70 list-disc list-inside">
          <li>あなたが所属する Discord サーバーで bot が稼働している場合、固定スケジュール一覧</li>
          <li>軽減回しエディタ (W-1)</li>
          <li>募集テンプレジェネレーター UI (W-2)</li>
          <li>進行度トラッカー (FFLogs / Vigil 連携)</li>
        </ul>
      </section>

      <section>
        <p className="text-sm text-black/60 dark:text-white/60">
          bot をまだ Discord サーバーに招待していない場合は、
          <Link href="/" className="underline ml-1">トップページ</Link>
          {" "}から招待リンクを取得してください (準備中)。
        </p>
      </section>
    </div>
  );
}
