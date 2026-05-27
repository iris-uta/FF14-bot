/**
 * In-memory store for /vote new drafts.
 *
 * /vote new (slash command) は title 等を slash option で受け取り、候補は
 * 別 step (modal) で受け取る。slash → modal の間に option データを保持する
 * 短命な store。draft は 15 分で expire (cleanup)。
 *
 * 永続化しないので bot 再起動で消えるが、modal は immediate UI なので問題なし。
 */

const TTL_MS = 15 * 60_000;

export interface VoteDraft {
  guildId: string;
  channelId: string;
  creatorId: string;
  title: string;
  closesAt: number | null;
  mention: string | null;
  reminderHoursBefore: number | null;
  staticId: string | null;
  createdAt: number;
}

const drafts = new Map<string, VoteDraft>();

export function putDraft(id: string, draft: VoteDraft): void {
  pruneExpired();
  drafts.set(id, draft);
}

export function takeDraft(id: string): VoteDraft | null {
  pruneExpired();
  const d = drafts.get(id);
  if (!d) return null;
  drafts.delete(id);
  return d;
}

export function peekDraft(id: string): VoteDraft | null {
  pruneExpired();
  return drafts.get(id) ?? null;
}

export function clearAllDrafts(): void {
  drafts.clear();
}

export function draftCount(): number {
  return drafts.size;
}

function pruneExpired(now: number = Date.now()): void {
  for (const [id, d] of drafts.entries()) {
    if (now - d.createdAt > TTL_MS) drafts.delete(id);
  }
}

/** Test-only export to control the pruning clock. */
export function pruneNow(now: number): void {
  pruneExpired(now);
}
