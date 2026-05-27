import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, isAuthConfigured } from "@/auth";
import { listUpcomingForUser, type UpcomingScheduleRow } from "@/lib/queries";

export const metadata: Metadata = {
  title: "予定一覧 — FF14 固定支援 Bot",
};

export const dynamic = "force-dynamic";

export default async function UpcomingPage() {
  if (!isAuthConfigured()) {
    return (
      <div className="max-w-2xl mx-auto py-10 space-y-4">
        <h1 className="text-2xl font-bold">認証が未設定です</h1>
      </div>
    );
  }
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin?callbackUrl=/upcoming");
  const discordId = (session.user as { discordId?: string }).discordId;
  if (!discordId) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <p>セッションに Discord ID がありません。再ログインしてください。</p>
      </div>
    );
  }

  const rows = listUpcomingForUser(discordId, 14);
  const byDay = groupByJstDay(rows);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold">📅 直近 2 週間の予定</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          あなたが所属する固定 ({rows.length} 件) の予定。Discord 内では <code>/upcoming</code> でも確認できます。
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          直近 2 週間に予定はありません。Discord で <code>/book</code> または <code>/recurring set</code> から登録してください。
        </p>
      ) : (
        <div className="space-y-6">
          {byDay.map(({ dayLabel, rows }) => (
            <DaySection key={dayLabel} dayLabel={dayLabel} rows={rows} />
          ))}
        </div>
      )}
    </div>
  );
}

function DaySection({ dayLabel, rows }: { dayLabel: string; rows: UpcomingScheduleRow[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-black/70 dark:text-white/70 mb-2">
        {dayLabel}
      </h2>
      <ul className="space-y-2">
        {rows.map(({ schedule, staticName, staticId }) => {
          const timeLabel = formatJstTime(schedule.startsAt);
          const relative = relativeFromNow(schedule.startsAt);
          return (
            <li
              key={schedule.id}
              className="rounded-md border border-black/10 dark:border-white/10 p-3 flex gap-3 items-start"
            >
              <div className="text-sm font-mono whitespace-nowrap w-14 text-black/60 dark:text-white/60">
                {timeLabel}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium flex items-center gap-2">
                  {staticName && staticId ? (
                    <Link
                      href={`/static/${staticId}` as never}
                      className="hover:underline"
                    >
                      {staticName}
                    </Link>
                  ) : (
                    <span className="text-black/60 dark:text-white/60">(個別予定)</span>
                  )}
                  {schedule.phaseId && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300">
                      {schedule.phaseId}
                    </span>
                  )}
                </div>
                <div className="text-xs text-black/50 dark:text-white/50 mt-0.5">
                  {relative}
                  {schedule.notifyMinutesBefore !== undefined && (
                    <> · {schedule.notifyMinutesBefore}分前通知</>
                  )}
                </div>
                {schedule.note && (
                  <div className="text-xs mt-1 text-black/60 dark:text-white/60">
                    {schedule.note}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function groupByJstDay(rows: UpcomingScheduleRow[]): { dayLabel: string; rows: UpcomingScheduleRow[] }[] {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const groups = new Map<string, UpcomingScheduleRow[]>();
  for (const r of rows) {
    const key = fmt.format(new Date(r.schedule.startsAt));
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return Array.from(groups.entries()).map(([dayLabel, rows]) => ({ dayLabel, rows }));
}

function formatJstTime(unixMs: number): string {
  return new Date(unixMs).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function relativeFromNow(unixMs: number): string {
  const diff = unixMs - Date.now();
  const days = Math.floor(diff / (24 * 60 * 60_000));
  if (days > 0) return `${days} 日後`;
  const hours = Math.floor(diff / (60 * 60_000));
  if (hours > 0) return `${hours} 時間後`;
  const mins = Math.floor(diff / 60_000);
  return mins > 0 ? `${mins} 分後` : "もうすぐ";
}
