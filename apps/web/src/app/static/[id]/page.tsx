import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth, isAuthConfigured } from "@/auth";
import { getStaticOverviewForUser } from "@/lib/queries";

export const metadata: Metadata = {
  title: "固定詳細 — FF14 固定支援 Bot",
};

export const dynamic = "force-dynamic";

const SLOT_ORDER = ["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"] as const;

const SLOT_ICON: Record<string, string> = {
  MT: "🛡️", ST: "🛡️",
  H1: "💚", H2: "💚",
  D1: "⚔️", D2: "⚔️", D3: "⚔️", D4: "⚔️",
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  open:      { label: "募集中", cls: "bg-green-500/10 text-green-700 dark:text-green-300" },
  applied:   { label: "申請中", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  confirmed: { label: "確定",   cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  filled:    { label: "完了",   cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  closed:    { label: "クローズ", cls: "bg-gray-500/10 text-gray-700 dark:text-gray-300" },
};

const STATUS_ICON: Record<string, string> = {
  reached: "📍",
  cleared: "🎯",
  "first-clear": "🏆",
  note: "📝",
};

const STATUS_JA: Record<string, string> = {
  reached: "到達",
  cleared: "撃破",
  "first-clear": "初見クリア",
  note: "メモ",
};

export default async function StaticDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isAuthConfigured()) {
    return (
      <div className="max-w-2xl mx-auto py-10 space-y-4">
        <h1 className="text-2xl font-bold">認証が未設定です</h1>
        <p className="text-black/70">ダッシュボードを表示するには Discord OAuth 設定が必要です。</p>
        <Link href={"/dashboard" as never} className="underline">/dashboard を見る</Link>
      </div>
    );
  }

  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin?callbackUrl=/dashboard");
  }

  const discordId = (session.user as { discordId?: string }).discordId;
  if (!discordId) return notFound();

  const { id } = await params;
  const overview = getStaticOverviewForUser(id, discordId);
  if (!overview) return notFound();

  const { vstatic, slots, members, upcoming, recentProgress } = overview;
  const isPaused = vstatic.pausedUntil !== null && vstatic.pausedUntil > Date.now();
  const isLeader = vstatic.leaderId === discordId;

  // Index slots by role for O(1) display
  const slotByRole = Object.fromEntries(slots.map((s) => [s.role, s]));

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* breadcrumb */}
      <div className="text-sm">
        <Link href={"/dashboard" as never} className="hover:underline text-black/60 dark:text-white/60">
          ← ダッシュボード
        </Link>
      </div>

      {/* header */}
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          {isPaused && <span title={`〜${formatJst(vstatic.pausedUntil!)}まで一時停止中`}>⏸️</span>}
          <h1 className="text-3xl font-bold">{vstatic.name}</h1>
          {isLeader && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">
              👑 リーダー
            </span>
          )}
        </div>
        <p className="text-sm text-black/60 dark:text-white/60">
          📜 {vstatic.contentId}
          {vstatic.currentPhaseId && <> · 🎯 進行中: <strong>{vstatic.currentPhaseId}</strong></>}
          {vstatic.strategyId && <> · 戦略: {vstatic.strategyId}</>}
        </p>
      </header>

      {/* slots grid */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">ロール構成 (8 slot)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SLOT_ORDER.map((role) => {
            const slot = slotByRole[role];
            const status = slot?.status ?? "open";
            const ui = STATUS_LABEL[status] ?? STATUS_LABEL.open;
            const assigneeId = slot?.assigneeUserId;
            return (
              <div
                key={role}
                className="rounded-md border border-black/10 dark:border-white/10 p-3 space-y-1"
              >
                <div className="text-xs font-semibold flex items-center gap-1">
                  <span>{SLOT_ICON[role]}</span>
                  <span>{role}</span>
                </div>
                {assigneeId ? (
                  <div className="text-sm">
                    <div className="text-xs text-black/40 dark:text-white/40 truncate" title={assigneeId}>
                      {assigneeId.slice(0, 12)}…
                    </div>
                    {slot?.job && <div className="text-sm font-medium">{slot.job}</div>}
                  </div>
                ) : (
                  <div className="text-xs text-black/40 dark:text-white/40">未割当</div>
                )}
                <div className={`inline-block text-xs px-1.5 py-0.5 rounded ${ui.cls}`}>
                  {ui.label}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* active members */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">アクティブメンバー ({members.length})</h2>
        {members.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">メンバーがまだいません。</p>
        ) : (
          <ul className="space-y-1">
            {members.map((m) => (
              <li key={m.userId} className="text-sm flex items-center gap-2">
                <span>{m.gameRole ? SLOT_ICON[m.gameRole] : "▸"}</span>
                <code className="text-xs text-black/50 dark:text-white/50">{m.userId.slice(0, 16)}…</code>
                <span className="text-xs text-black/60 dark:text-white/60">
                  {m.gameRole ?? "?"} / {m.job ?? "?"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* upcoming schedules */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">📅 直近の予定 ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            予定はありません。Discord で <code>/book</code> から登録してください。
          </p>
        ) : (
          <ul className="space-y-1">
            {upcoming.map((s) => (
              <li
                key={s.id}
                className="text-sm flex items-start gap-2 rounded p-2 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span>▸</span>
                <div className="flex-1">
                  <div className="font-medium">
                    {formatJst(s.startsAt)} JST
                  </div>
                  {(s.phaseId || s.note) && (
                    <div className="text-xs text-black/50 dark:text-white/50">
                      {s.phaseId && <span>{s.phaseId}</span>}
                      {s.phaseId && s.note && " — "}
                      {s.note}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* progress timeline (latest 10) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">📈 最近の進行記録 ({recentProgress.length})</h2>
        {recentProgress.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            記録なし。Discord で <code>/progress mark</code> から記録できます。
          </p>
        ) : (
          <ul className="space-y-1">
            {recentProgress.map((log) => (
              <li key={log.id} className="text-sm flex items-start gap-2">
                <span>{STATUS_ICON[log.status] ?? "▸"}</span>
                <div className="flex-1">
                  <span className="text-xs text-black/50 dark:text-white/50">
                    {formatJstDate(log.loggedAt)}
                  </span>{" "}
                  {log.phaseId && <strong>{log.phaseId}</strong>}{" "}
                  {STATUS_JA[log.status] ?? log.status}
                  {log.note && <span className="text-black/60 dark:text-white/60"> — {log.note}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="text-xs text-black/40 dark:text-white/40 pt-4 border-t border-black/10 dark:border-white/10">
        ID: <code>{vstatic.id}</code> · 作成: {formatJstDate(vstatic.createdAt)}
      </footer>
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
