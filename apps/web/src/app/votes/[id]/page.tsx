import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth, isAuthConfigured } from "@/auth";
import { getVisibleVoteDetail } from "@/lib/queries";

export const metadata: Metadata = {
  title: "投票結果 — FF14 固定支援 Bot",
};

export const dynamic = "force-dynamic";

export default async function VoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isAuthConfigured()) {
    return (
      <div className="max-w-2xl mx-auto py-10 space-y-4">
        <h1 className="text-2xl font-bold">認証が未設定です</h1>
      </div>
    );
  }
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin?callbackUrl=/votes");
  const discordId = (session.user as { discordId?: string }).discordId;
  if (!discordId) return notFound();

  const { id } = await params;
  const detail = getVisibleVoteDetail(id, discordId);
  if (!detail) return notFound();

  const { vote, candidates, tallies } = detail;

  // Rank candidates by yes count desc
  const ranked = candidates
    .map((c, i) => ({ c, t: tallies[i], i }))
    .sort((a, b) => b.t.yes - a.t.yes);
  const winner = ranked[0];
  const winnerYesCount = winner?.t.yes ?? 0;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-sm">
        <Link href={"/votes" as never} className="hover:underline text-black/60 dark:text-white/60">
          ← 投票一覧
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          {vote.closed && <span>🔒</span>}
          {vote.title}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {vote.closed ? "締切済み" : "公開中"}
          {vote.closesAt && (
            <> · 締切: {formatJst(vote.closesAt)} JST</>
          )}
          {" · "}作成: {formatJstDate(vote.createdAt)}
        </p>
      </header>

      {candidates.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">候補がありません。</p>
      ) : (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">候補別 結果</h2>
          <ul className="space-y-2">
            {candidates.map((cand, i) => {
              const t = tallies[i];
              const total = t.yes + t.no + t.maybe;
              const isWinner = vote.closed && winnerYesCount > 0 && t.yes === winnerYesCount;
              return (
                <li
                  key={cand.index}
                  className={`rounded-md border p-3 ${
                    isWinner
                      ? "border-amber-400 bg-amber-500/5"
                      : "border-black/10 dark:border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isWinner && <span title="最多 yes">🏆</span>}
                    <span className="font-medium">
                      {cand.index + 1}. {cand.label}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <Tally label="参加" emoji="⭕" count={t.yes} total={total} color="green" />
                    <Tally label="不可" emoji="❌" count={t.no} total={total} color="red" />
                    <Tally label="未定" emoji="🤔" count={t.maybe} total={total} color="gray" />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <footer className="text-xs text-black/40 dark:text-white/40 pt-4 border-t border-black/10 dark:border-white/10">
        vote id: <code>{vote.id}</code>
        <br />
        Discord 内で投票するには 元のメッセージのボタン UI を使ってください。
      </footer>
    </div>
  );
}

function Tally({ label, emoji, count, total, color }: {
  label: string;
  emoji: string;
  count: number;
  total: number;
  color: "green" | "red" | "gray";
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barColor =
    color === "green" ? "bg-green-500" :
    color === "red" ? "bg-red-500" : "bg-gray-400";
  return (
    <div>
      <div className="text-xs flex items-center gap-1 mb-1">
        <span>{emoji}</span>
        <span className="text-black/60 dark:text-white/60">{label}</span>
        <span className="ml-auto font-medium">{count}</span>
      </div>
      <div className="h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
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
