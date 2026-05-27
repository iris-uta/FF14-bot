import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, isAuthConfigured } from "@/auth";
import { listMyStatics, listVisibleOpenVotes } from "@/lib/queries";

export const metadata: Metadata = {
  title: "ダッシュボード — FF14 固定支援 Bot",
};

// Force dynamic — auth check + DB read happen on every request.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!isAuthConfigured()) {
    return <UnconfiguredView />;
  }

  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin?callbackUrl=/dashboard");
  }

  const discordId = (session.user as { discordId?: string }).discordId;
  if (!discordId) {
    return (
      <div className="max-w-2xl mx-auto py-10 space-y-4">
        <h1 className="text-2xl font-bold">セッションに Discord ID がありません</h1>
        <p>一度ログアウトして再ログインしてください。</p>
      </div>
    );
  }

  const myStatics = listMyStatics(discordId);
  const openVotes = listVisibleOpenVotes(discordId, 8);

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            こんにちは、{session.user.name ?? "プレイヤー"}さん
          </h1>
          <p className="text-sm text-black/50 dark:text-white/50">
            Discord ID:{" "}
            <code className="bg-black/5 dark:bg-white/10 px-1 py-0.5 rounded text-xs">
              {discordId}
            </code>
          </p>
        </div>
      </header>

      {/* 自分の固定 */}
      <section className="rounded-lg border border-black/10 dark:border-white/10 p-6 space-y-3">
        <h2 className="text-lg font-semibold">あなたの固定 ({myStatics.length})</h2>
        {myStatics.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            まだ固定に参加していません。Discord で <code>/setup</code> から作成 or リーダーに招待してもらってください。
          </p>
        ) : (
          <ul className="space-y-2">
            {myStatics.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/static/${s.id}` as never}
                  className="block rounded-md border border-black/10 dark:border-white/10 p-3 hover:bg-black/5 dark:hover:bg-white/5 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-black/50 dark:text-white/50">
                        {s.contentId}
                        {s.currentPhaseId && ` · 進行中: ${s.currentPhaseId}`}
                        {s.leaderId === discordId && " · 👑 リーダー"}
                      </div>
                    </div>
                    <span className="text-black/30 text-lg">›</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 直近の投票 */}
      <section className="rounded-lg border border-black/10 dark:border-white/10 p-6 space-y-3">
        <h2 className="text-lg font-semibold">公開中の投票 ({openVotes.length})</h2>
        {openVotes.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            あなたが所属するサーバーに公開中の投票はありません。
          </p>
        ) : (
          <ul className="space-y-1">
            {openVotes.map((v) => (
              <li key={v.id} className="text-sm flex items-start gap-2">
                <span>🗳️</span>
                <div>
                  <div className="font-medium">{v.title}</div>
                  {v.closesAt && (
                    <div className="text-xs text-black/50 dark:text-white/50">
                      締切: {new Date(v.closesAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} JST
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-black/40 dark:text-white/40">
          投票は Discord 内で実施 (`/vote new` または既存メッセージのボタン)
        </p>
      </section>

      <FeaturePreview />
    </div>
  );
}

function UnconfiguredView() {
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
            Discord Developer Portal → OAuth2 → Reset Secret で{" "}
            <code>AUTH_DISCORD_SECRET</code> 取得
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
      <FeaturePreview />
    </div>
  );
}

function FeaturePreview() {
  return (
    <section className="rounded-lg border border-black/10 dark:border-white/10 p-6 space-y-4">
      <h2 className="text-lg font-semibold">今後追加される機能</h2>
      <ul className="space-y-2 text-sm text-black/70 dark:text-white/70">
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
        詳細設計:{" "}
        <Link
          href="https://github.com/mitchkunn/FF14-bot/blob/main/docs/static-leader-flow.md"
          className="underline"
        >
          docs/static-leader-flow.md
        </Link>
      </p>
    </section>
  );
}
