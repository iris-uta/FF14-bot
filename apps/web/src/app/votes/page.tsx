import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, isAuthConfigured } from "@/auth";
import { listVisibleVotes } from "@/lib/queries";

export const metadata: Metadata = {
  title: "投票一覧 — FF14 固定支援 Bot",
};

export const dynamic = "force-dynamic";

export default async function VotesIndexPage() {
  if (!isAuthConfigured()) {
    return (
      <div className="max-w-2xl mx-auto py-10 space-y-4">
        <h1 className="text-2xl font-bold">認証が未設定です</h1>
        <p>投票一覧を見るには Discord 連携が必要です。</p>
      </div>
    );
  }
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin?callbackUrl=/votes");
  const discordId = (session.user as { discordId?: string }).discordId;
  if (!discordId) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <p>セッションに Discord ID がありません。再ログインしてください。</p>
      </div>
    );
  }

  const all = listVisibleVotes(discordId, { limit: 50 });
  const open = all.filter((v) => !v.closed);
  const closed = all.filter((v) => v.closed);

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold">🗳️ 投票一覧</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          あなたが所属するサーバーで投票可能なものを表示しています。
          投票自体は Discord 内のメッセージで実施 (ボタン UI)。
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">公開中 ({open.length})</h2>
        {open.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            公開中の投票はありません。
          </p>
        ) : (
          <VoteList votes={open} />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">最近締切 ({closed.length})</h2>
        {closed.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            締切済みの投票はありません。
          </p>
        ) : (
          <VoteList votes={closed} />
        )}
      </section>
    </div>
  );
}

function VoteList({ votes }: { votes: Array<{ id: string; title: string; closesAt: number | null; closed: boolean; createdAt: number }> }) {
  return (
    <ul className="space-y-2">
      {votes.map((v) => (
        <li key={v.id}>
          <Link
            href={`/votes/${v.id}` as never}
            className="block rounded-md border border-black/10 dark:border-white/10 p-3 hover:bg-black/5 dark:hover:bg-white/5 transition"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  {v.closed && <span>🔒</span>}
                  {v.title}
                </div>
                <div className="text-xs text-black/50 dark:text-white/50 mt-0.5">
                  {v.closesAt
                    ? `締切: ${formatJst(v.closesAt)} JST`
                    : "締切なし (手動)"}
                  {" · "}作成: {formatJstDate(v.createdAt)}
                </div>
              </div>
              <span className="text-black/30 text-lg">›</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function formatJst(unixMs: number): string {
  return new Date(unixMs).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatJstDate(unixMs: number): string {
  return new Date(unixMs).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
